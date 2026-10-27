# LoanCalc RD Backend

ASP.NET Core 10 + PostgreSQL 17 + EF Core 10. La Fase 5 ya está fusionada. **La Fase 6 está en desarrollo en una rama independiente y NO se debe desplegar aún en producción.**

## Fase 6 — Primer incremento (Identity / JWT)

- Cuentas de usuario mediante ASP.NET Core Identity (GUID, contraseñas hasheadas, política robusta y bloqueo temporal por intentos).
- Registro `POST /api/v1/auth/register`, login `POST /api/v1/auth/login` y perfil `GET /api/v1/auth/me`.
- JWT Bearer firmado con HMAC SHA-256, vigencia de 15 minutos, issuer/audience y secreto obligatorio (sin valor predeterminado).
- Limitación de peticiones de registro/login por IP.
- `/api/v1/simulations`: GET, GET por ID, POST, PATCH nombre, PATCH favorito y DELETE. **Todas las rutas requieren JWT**; el `UserId` procede exclusivamente del claim validado.
- Eliminado el endpoint temporal `/api/v1/dev/users/{userId}/simulations`.
- Migración incremental `AddIdentityAccounts` para usuarios Identity; preserva `InitialCreate` y las simulaciones existentes.

### Desarrollo local (PowerShell)

Desde `backend`, con Docker Desktop y .NET SDK 10:

```powershell
docker compose up -d postgres
$env:ConnectionStrings__LoanCalcDb="Host=localhost;Port=5432;Database=loancalcrd;Username=loancalc;Password=loancalc_dev"
$secretBytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Fill($secretBytes)
$env:Jwt__SigningKey = [Convert]::ToBase64String($secretBytes)
dotnet restore src/LoanCalcRD.Api/LoanCalcRD.Api.csproj
dotnet ef database update --project src/LoanCalcRD.Infrastructure/LoanCalcRD.Infrastructure.csproj --startup-project src/LoanCalcRD.Api/LoanCalcRD.Api.csproj
dotnet test tests/LoanCalcRD.Tests/LoanCalcRD.Tests.csproj
dotnet run --project src/LoanCalcRD.Api/LoanCalcRD.Api.csproj --urls http://localhost:5000
```

La clave JWT anterior existe **solo en esa sesión de PowerShell**. En producción usar Secret Manager/variables seguras, un valor aleatorio persistente y HTTPS. Una clave diferente invalida los tokens previos.

### Probar rutas

```powershell
$body = @{email="prueba@example.test";password="ClaveDePrueba!2026"} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:5000/api/v1/auth/register -Method Post -ContentType application/json -Body $body
$session = Invoke-RestMethod -Uri http://localhost:5000/api/v1/auth/login -Method Post -ContentType application/json -Body $body
Invoke-RestMethod -Uri http://localhost:5000/api/v1/auth/me -Headers @{Authorization="Bearer $($session.accessToken)"}
Invoke-RestMethod -Uri http://localhost:5000/api/v1/simulations -Headers @{Authorization="Bearer $($session.accessToken)"}
```

La interfaz Angular de cuenta está habilitada **solo en modo desarrollo**, en `http://localhost:4200/account`. El token de acceso no se guarda en localStorage ni sessionStorage; permanece en memoria. La sincronización automática desde la calculadora se abordará tras completar el flujo de sesión.

### Antes del merge de Fase 6

**No habilitar en producción todavía.** Faltan confirmación real de correo electrónico y proveedor de envío, recuperación segura de contraseña, refresh tokens revocables con rotación, cierre de sesión del servidor, pruebas E2E/HTTP de autenticación y aislamiento de usuarios, y configuración final de origen/HTTPS. CI de ambas tecnologías y migraciones debe quedar verde. Mientras no se complete el correo de confirmación, `RequireConfirmedEmail=false` es una limitación conocida de este primer incremento.

## Arquitectura

```text
backend/
├── src/
│   ├── LoanCalcRD.Domain/
│   ├── LoanCalcRD.Application/
│   ├── LoanCalcRD.Infrastructure/
│   └── LoanCalcRD.Api/
├── tests/LoanCalcRD.Tests/
└── docker-compose.yml
```

Pruebas de la versión anterior de backend: `dotnet test tests/LoanCalcRD.Tests/LoanCalcRD.Tests.csproj`.
