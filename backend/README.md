# LoanCalc RD — Backend

ASP.NET Core 10 · Entity Framework Core 10 · PostgreSQL 17 · Clean Architecture.

> **Estado:** Fase 5 fusionada en `master`. **Fase 6 (cuentas y seguridad) en revisión en el PR #57.** La API aún no está desplegada en producción (Fase 8); el frontend publicado mantiene las cuentas desactivadas.

---

## Arquitectura

```text
backend/
├── src/
│   ├── LoanCalcRD.Domain/          # Entidades y reglas (LoanSimulation, LoanType). Sin dependencias.
│   ├── LoanCalcRD.Application/     # Casos de uso (LoanSimulationService), DTOs y puertos (ILoanSimulationRepository).
│   ├── LoanCalcRD.Infrastructure/  # EF Core + Npgsql, Identity stores, sesiones, repositorios y migraciones.
│   └── LoanCalcRD.Api/
│       ├── Program.cs              # Composición mínima (≈15 líneas)
│       ├── Extensions/             # Registro de servicios y pipeline HTTP
│       ├── Endpoints/              # AuthEndpoints, SimulationEndpoints, SystemEndpoints, contratos
│       └── Infrastructure/         # JWT, sesiones, correo, CSRF, Problem Details, health checks, opciones
├── tests/LoanCalcRD.Tests/         # xUnit: unitarias + integración HTTP contra PostgreSQL real
└── docker-compose.yml              # PostgreSQL 17 para desarrollo
```

---

## Endpoints (`/api/v1`)

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/auth/register` | — | Registro. Respuesta neutra `202` (no revela si el correo existe). |
| POST | `/auth/confirm-email` | — | `{ userId, token }` del enlace del correo. |
| POST | `/auth/resend-confirmation` | — | Reenvía la confirmación (respuesta neutra). |
| POST | `/auth/forgot-password` | — | Envía enlace de recuperación (respuesta neutra). |
| POST | `/auth/reset-password` | — | `{ userId, token, newPassword }`. Revoca todas las sesiones. |
| POST | `/auth/login` | — | Devuelve access token y fija la cookie de refresh. |
| POST | `/auth/refresh` | Cookie + CSRF | Rota el refresh token y devuelve un access token nuevo. |
| POST | `/auth/logout` | Cookie + CSRF | Revoca la sesión de este dispositivo. |
| POST | `/auth/logout-all` | JWT + CSRF | Revoca todas las sesiones del usuario. |
| POST | `/auth/change-password` | JWT | `{ currentPassword, newPassword }`. Revoca todas las sesiones y emite una nueva. |
| GET | `/auth/me` | JWT | `{ id, email, emailConfirmed }`. |
| GET/POST | `/simulations` | JWT | Lista / crea simulaciones del usuario autenticado. |
| GET/DELETE | `/simulations/{id}` | JWT | Lee / elimina (404 si no es del usuario). |
| PATCH | `/simulations/{id}/name` · `/favorite` | JWT | Renombra / marca favorita. |
| GET | `/health/live` · `/health` | — | Liveness · readiness (incluye PostgreSQL). |

### Errores

Todas las respuestas de error usan **Problem Details (RFC 9457)** con un código estable en `code`, que el frontend traduce:

`invalid_email`, `weak_password`, `invalid_credentials`, `email_not_confirmed`, `invalid_link`, `invalid_current_password`, `same_password`, `session_expired`, `csrf_rejected`, `email_unavailable`, `too_many_requests`, `not_found`, `validation_failed`, `malformed_request`.

Nunca se devuelven trazas, mensajes de excepción, hashes ni datos de otras cuentas.

---

## Seguridad

### Identity

- Contraseñas de 12–128 caracteres con mayúscula, minúscula, número y símbolo (validadas **antes** de comprobar si el correo existe).
- Bloqueo de 15 minutos tras 5 intentos fallidos. Un usuario bloqueado recibe la misma respuesta genérica que una contraseña incorrecta.
- `RequireConfirmedEmail = true`. El estado "pendiente de confirmar" (`403 email_not_confirmed`) solo se revela a quien envía la contraseña correcta.
- Login con coste temporal igualado para correos inexistentes (verificación de un hash ficticio).
- Tokens de correo (Data Protection) con vigencia configurable (2 h por defecto); el de recuperación queda inutilizable tras usarse (actualiza el sello de seguridad).

### JWT y sesiones

- Access token **HS256** de 15 minutos (5–30 configurables), con `iss`, `aud`, `exp`, `nbf`, `sub` y `sid`. Solo se acepta `HS256`; tokens sin firma, alterados, expirados, de otra audiencia o firmados con otra clave se rechazan.
- Cada petición comprueba que la sesión `sid` siga activa: logout, logout global, cambio/restablecimiento de contraseña, reutilización de refresh o eliminación del usuario invalidan el JWT al instante.
- **Refresh tokens**: 48 bytes aleatorios (CSPRNG), se almacena solo su SHA-256, un solo uso, rotación atómica (`UPDATE … WHERE ConsumedAtUtc IS NULL`) dentro de transacción. Reutilizar un token consumido o perder una carrera concurrente **revoca la sesión completa**. Expiración absoluta de 14 días que la rotación no extiende.
- Máximo 10 sesiones activas por usuario (se revocan las más antiguas) y limpieza horaria de sesiones expiradas/revocadas tras 7 días.

### Cookies, CORS y CSRF

| Atributo | Valor |
|---|---|
| Nombre | `loancalcrd_refresh` |
| `HttpOnly` | Siempre |
| `Secure` | Siempre fuera de desarrollo; siempre si `SameSite=None` |
| `SameSite` | `Strict` por defecto (`Auth:Cookie:SameSite`) |
| `Path` | `/api/v1/auth` (no viaja a otros endpoints) |

- Los endpoints que usan la cookie exigen el encabezado `X-LoanCalc-CSRF: 1` **y** que `Origin` (o `Referer`) sea la propia API o un origen de `Cors:AllowedOrigins`. `Origin: null` se rechaza.
- CORS: orígenes explícitos, credenciales permitidas, solo `GET/POST/PATCH/DELETE` y encabezados `Content-Type`, `Authorization`, `X-LoanCalc-CSRF`.
- **Topología recomendada:** servir la API bajo el mismo sitio que el frontend (proxy `/api/*` de Netlify o subdominio del mismo dominio registrable) para mantener `SameSite=Strict`. Ver [`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).

### Otros

- Rate limiting por IP y política (`login`, `registration`, `verification`, `recovery`, `session`, `api`) con `429` + `Retry-After`; configurable en `RateLimiting:*`.
- `X-Forwarded-For/Proto` solo se aceptan de `ForwardedHeaders:KnownProxies/KnownNetworks`.
- Encabezados: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy` (API), `Cache-Control: no-store` en `/auth`, HSTS fuera de desarrollo.
- Los logs nunca contienen contraseñas, JWT, refresh tokens ni enlaces; los correos se registran enmascarados (`a***@dominio`).
- Las simulaciones se filtran siempre por el `sub` del JWT; cualquier `userId` enviado por el cliente se ignora.

---

## Configuración

Los secretos **no** se guardan en el repositorio. Usa variables de entorno (`__` separa secciones) o User Secrets.

| Clave | Obligatoria | Descripción |
|---|:---:|---|
| `ConnectionStrings__LoanCalcDb` | ✅ | Cadena de conexión de PostgreSQL. |
| `Jwt__SigningKey` | ✅ | ≥ 32 bytes aleatorios. La API no arranca sin ella. |
| `Jwt__Issuer` / `Jwt__Audience` | — | Por defecto `LoanCalcRD` / `LoanCalcRD.Web`. |
| `Auth__FrontendAccountUrl` | ✅ | URL de la página `/account` del frontend (HTTPS fuera de desarrollo; validada al arrancar). |
| `Auth__Cookie__SameSite` | — | `Strict` (defecto), `Lax` o `None`. |
| `Cors__AllowedOrigins__0` … | ✅ prod | Orígenes exactos del frontend. |
| `Smtp__Host`, `Smtp__Port`, `Smtp__From`, `Smtp__FromName`, `Smtp__Username`, `Smtp__Password`, `Smtp__TimeoutSeconds` | ✅ prod | Proveedor SMTP con TLS (STARTTLS/SMTPS). |
| `DataProtection__KeysPath` | ✅ prod | Directorio persistente y compartido para las claves de Data Protection. |
| `ForwardedHeaders__KnownProxies__0` / `KnownNetworks__0` | Según hosting | Proxies de confianza. |
| `RateLimiting__<Política>__PermitLimit` / `WindowSeconds` | — | Ajuste de límites. |

**Sin SMTP** la API arranca, registra una advertencia y responde `503 email_unavailable` en registro, reenvío y recuperación. La confirmación de correo **no** se desactiva nunca.

### User Secrets (desarrollo)

```powershell
cd backend/src/LoanCalcRD.Api
dotnet user-secrets init
dotnet user-secrets set "ConnectionStrings:LoanCalcDb" "Host=localhost;Port=5432;Database=loancalcrd;Username=loancalc;Password=loancalc_dev"
$bytes = New-Object byte[] 48; [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
dotnet user-secrets set "Jwt:SigningKey" ([Convert]::ToBase64String($bytes))
# Opcional: SMTP de pruebas (por ejemplo, un buzón de desarrollo con TLS)
dotnet user-secrets set "Smtp:Host" "smtp.ejemplo.dev"
dotnet user-secrets set "Smtp:From" "no-reply@ejemplo.dev"
dotnet user-secrets set "Smtp:Username" "<usuario>"
dotnet user-secrets set "Smtp:Password" "<contraseña>"
```

---

## Desarrollo local

```powershell
cd backend
docker compose up -d postgres
dotnet restore src/LoanCalcRD.Api/LoanCalcRD.Api.csproj
dotnet tool install --global dotnet-ef --version 10.0.10   # una sola vez
dotnet ef database update --project src/LoanCalcRD.Infrastructure/LoanCalcRD.Infrastructure.csproj --startup-project src/LoanCalcRD.Api/LoanCalcRD.Api.csproj
dotnet run --project src/LoanCalcRD.Api/LoanCalcRD.Api.csproj --urls http://localhost:5000
```

Con el frontend en `http://localhost:4200` (`npm start`), las pantallas de cuenta ya apuntan a `http://localhost:5000/api/v1`.

---

## Migraciones

| Migración | Contenido |
|---|---|
| `20260902193000_InitialCreate` | `loan_simulations` (Fase 5). |
| `20261027005000_AddIdentityAccounts` | Tablas de ASP.NET Core Identity (usuarios GUID). |
| `20261104163300_AddRevocableSessions` | `auth_sessions` y `auth_refresh_tokens` (hash único, cascadas). |

La Fase 6 final **no añade migraciones nuevas**: los cambios de seguridad no alteran el modelo. El CI verifica:

1. Base nueva → todas las migraciones.
2. Base en estado Fase 5 **con datos** → actualización a la última migración conservando las simulaciones.
3. Reversión hasta `InitialCreate` sin pérdida de simulaciones.
4. `HasPendingModelChanges() == false` (el modelo coincide con el snapshot).

En producción, aplica migraciones de forma controlada (paso de despliegue o bundle `dotnet ef migrations bundle`), nunca automáticamente al arrancar.

---

## Pruebas

```powershell
dotnet test tests/LoanCalcRD.Tests/LoanCalcRD.Tests.csproj --configuration Release
```

Requiere PostgreSQL con migraciones aplicadas y `ConnectionStrings__LoanCalcDb` + `Jwt__SigningKey` en el entorno (igual que en CI).

| Archivo | Cobertura |
|---|---|
| `RegistrationAndLoginTests` | Registro válido/inválido, duplicado sin enumeración, login, bloqueo, cuenta sin confirmar, confirmación, reenvío. |
| `PasswordRecoveryTests` | Recuperación, token inválido/reutilizado/de otro propósito, respuestas neutras, cambio de contraseña y revocación de sesiones. |
| `TokenAndSessionTests` | JWT expirado/alterado/sin firma/otra clave/otra audiencia, usuario eliminado, rotación, reutilización, **renovaciones concurrentes**, logout, logout global, tope de sesiones, limpieza. |
| `SimulationAuthorizationTests` | Acceso anónimo, IDOR entre dos usuarios, `userId` del cliente ignorado, persistencia real en PostgreSQL, validaciones y JSON malformado. |
| `SecurityPolicyTests` | CSRF (encabezado, `Origin`, `Referer`), CORS, atributos de cookie (`Strict` y `None`+`Secure`), encabezados de seguridad, health checks, migraciones, rate limiting. |
| `LoanSimulationServiceTests` | Servicio de aplicación con repositorio en memoria. |

> El correo se prueba con un **emisor simulado** (`CapturedAccountEmailSender`). Las pruebas validan tokens, enlaces y flujos, **no** la entrega por un proveedor SMTP real, que queda como verificación operativa de la Fase 8.

---

## Limitaciones conocidas

- Cola de correo en memoria: un reinicio puede perder mensajes en tránsito (el usuario puede reenviarlos). Para escalar horizontalmente, sustituir por una cola persistente.
- `loan_simulations.UserId` no tiene clave foránea hacia `AspNetUsers` porque la Fase 5 permitía filas sin usuario real; se añadirá en la Fase 7 con una migración de limpieza.
- El listado de simulaciones no está paginado (volumen por usuario bajo); se revisará al habilitar la sincronización en la Fase 7.
