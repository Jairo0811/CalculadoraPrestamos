# Guía de despliegue y secretos — LoanCalc RD v3

> Esta guía prepara la Fase 8. **Nada de esto está desplegado todavía**: el frontend publicado en Netlify mantiene las cuentas desactivadas (`features.accounts = false`).

## 1. Topología recomendada

```text
Navegador ──HTTPS──► loancalcrd.netlify.app (o dominio propio)
                     ├── /*        → Angular (estático)
                     └── /api/*    → proxy Netlify ──HTTPS──► API ASP.NET Core ──► PostgreSQL 17
```

**Por qué un proxy de mismo origen:** el refresh token vive en una cookie `HttpOnly` con `SameSite=Strict`. Si Angular y la API están en sitios distintos (por ejemplo `*.netlify.app` y `*.onrender.com`), la cookie es de terceros: con `Strict` o `Lax` el navegador no la envía en `fetch`, y con `None` muchos navegadores la bloquean por la protección contra rastreo. Con el proxy, para el navegador todo es el mismo origen y `Strict` funciona.

Pasos:

1. Publica la API en HTTPS.
2. En `netlify.toml`, descomenta la regla `/api/*` (antes de la regla SPA) con el dominio real de la API.
3. Mantén `apiBaseUrl: '/api/v1'` en `environment.production.ts`.
4. Configura en la API `Cors__AllowedOrigins__0=https://<sitio-netlify>` (para el `Origin` que reenvía el proxy) y `Auth__Cookie__SameSite=Strict`.
5. Cuando todo esté verificado, cambia `features.accounts` a `true` en `environment.production.ts`.

### Alternativa: dominios distintos

Solo si no es posible el proxy:

- `Auth__Cookie__SameSite=None` (la API fuerza `Secure`).
- `apiBaseUrl` absoluto en `environment.production.ts`.
- `Cors__AllowedOrigins__0` con el origen exacto del frontend.
- La protección CSRF (encabezado + `Origin`/`Referer` + CORS) sigue activa, pero los navegadores que bloquean cookies de terceros impedirán recuperar la sesión al recargar. Prefiere subdominios del mismo dominio registrable (`app.loancalcrd.do` / `api.loancalcrd.do`), que son *same-site*.

## 2. Variables de entorno de la API

| Variable | Ejemplo / nota |
|---|---|
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `ConnectionStrings__LoanCalcDb` | `Host=…;Port=5432;Database=loancalcrd;Username=…;Password=…;SSL Mode=Require` |
| `Jwt__SigningKey` | 48+ bytes aleatorios en Base64. Rotarla invalida todos los access tokens. |
| `Auth__FrontendAccountUrl` | `https://<sitio>/account` (HTTPS obligatorio) |
| `Auth__Cookie__SameSite` | `Strict` |
| `Cors__AllowedOrigins__0` | `https://<sitio>` |
| `Smtp__Host` / `Smtp__Port` | Proveedor con TLS, normalmente `587` |
| `Smtp__From` / `Smtp__FromName` | Remitente verificado (SPF/DKIM/DMARC configurados en el dominio) |
| `Smtp__Username` / `Smtp__Password` | Credenciales del proveedor |
| `DataProtection__KeysPath` | Volumen persistente, p. ej. `/var/loancalcrd/keys` |
| `ForwardedHeaders__KnownProxies__0` / `KnownNetworks__0` | IP o red del balanceador/proxy del hosting |

Generar la clave JWT:

```bash
openssl rand -base64 48
```

Guarda los secretos en el gestor del proveedor (variables cifradas), nunca en `appsettings*.json` ni en el repositorio.

## 3. Base de datos

1. PostgreSQL 17 con TLS y un usuario dedicado (sin permisos de superusuario).
2. Aplica migraciones como paso explícito del despliegue:

   ```bash
   dotnet ef migrations bundle --project backend/src/LoanCalcRD.Infrastructure/LoanCalcRD.Infrastructure.csproj \
     --startup-project backend/src/LoanCalcRD.Api/LoanCalcRD.Api.csproj --configuration Release -o efbundle
   ./efbundle --connection "$ConnectionStrings__LoanCalcDb"
   ```

3. Haz copia de seguridad antes de migrar. Las migraciones de la Fase 6 son aditivas y reversibles (verificado en CI).

## 4. Health checks

- `GET /health/live` — el proceso responde (sin dependencias). Úsalo como *liveness*.
- `GET /health` — incluye PostgreSQL. Úsalo como *readiness*.

## 5. Lista de verificación previa a habilitar cuentas

- [ ] API en HTTPS y HSTS activo.
- [ ] Proxy `/api/*` configurado y probado (`SameSite=Strict` funciona: recargar la página mantiene la sesión).
- [ ] `Jwt__SigningKey`, `DataProtection__KeysPath` y SMTP configurados.
- [ ] Correo real recibido: confirmación, recuperación, aviso de cambio de contraseña (verificación manual, no cubierta por CI).
- [ ] `ForwardedHeaders` configurado para que el rate limiting vea la IP real del cliente.
- [ ] Migraciones aplicadas y `GET /health` en verde.
- [ ] `features.accounts = true` en el build de producción.
