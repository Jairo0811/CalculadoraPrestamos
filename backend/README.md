# LoanCalc RD Backend

Backend de **LoanCalc RD v3** construido con **ASP.NET Core 10**, **Entity Framework Core 10** y **PostgreSQL**.

## Arquitectura

```text
backend/
├── src/
│   ├── LoanCalcRD.Domain/
│   ├── LoanCalcRD.Application/
│   ├── LoanCalcRD.Infrastructure/
│   └── LoanCalcRD.Api/
├── tests/
│   └── LoanCalcRD.Tests/
└── docker-compose.yml
```

### Responsabilidades

- **Domain:** entidades y reglas de negocio puras.
- **Application:** contratos, DTO y casos de uso.
- **Infrastructure:** EF Core, PostgreSQL, migraciones y repositorios.
- **Api:** composición, CORS, Problem Details, health checks y endpoints REST.
- **Tests:** cobertura automatizada del servicio de simulaciones.

## Requisitos

- .NET 10 SDK
- Docker Desktop
- `dotnet-ef` 10.x

## Base de datos local

Desde `backend`:

```powershell
docker compose up -d postgres
```

Configura la conexión mediante variable de entorno. No se almacenan credenciales de producción en el repositorio.

```powershell
$env:ConnectionStrings__LoanCalcDb="Host=localhost;Port=5432;Database=loancalcrd;Username=loancalc;Password=loancalc_dev"
```

## Restaurar, compilar y probar

```powershell
dotnet restore src/LoanCalcRD.Api/LoanCalcRD.Api.csproj
dotnet restore tests/LoanCalcRD.Tests/LoanCalcRD.Tests.csproj
dotnet build src/LoanCalcRD.Api/LoanCalcRD.Api.csproj
dotnet test tests/LoanCalcRD.Tests/LoanCalcRD.Tests.csproj
```

## Migraciones

La migración inicial `InitialCreate` ya está versionada en:

```text
src/LoanCalcRD.Infrastructure/Persistence/Migrations/
```

Para aplicarla:

```powershell
dotnet ef database update `
  --project src/LoanCalcRD.Infrastructure/LoanCalcRD.Infrastructure.csproj `
  --startup-project src/LoanCalcRD.Api/LoanCalcRD.Api.csproj
```

## Ejecutar API

```powershell
dotnet run --project src/LoanCalcRD.Api/LoanCalcRD.Api.csproj
```

Endpoints generales:

- `GET /health`
- `GET /api/v1/system/database`

En entorno `Development` también se habilita temporalmente:

```text
/api/v1/dev/users/{userId}/simulations
```

Operaciones disponibles:

- listar simulaciones;
- consultar una simulación;
- crear una simulación;
- renombrar;
- marcar o desmarcar favorito;
- eliminar.

Estos endpoints son deliberadamente exclusivos de `Development`. En la Fase 6 serán reemplazados por endpoints protegidos que obtendrán el usuario desde Identity/JWT, sin aceptar un `userId` arbitrario desde el cliente.

## Integración Angular

El frontend incorpora `LoanApiService` y `provideHttpClient()` como cliente de integración para desarrollo. La sincronización de cuenta definitiva se activará con la identidad autenticada en la Fase 6; la versión publicada continúa funcionando de forma local y no depende de que la API esté disponible.

## CI

`.github/workflows/backend.yml` valida automáticamente:

1. restore;
2. build Release;
3. pruebas automatizadas;
4. PostgreSQL real mediante servicio de GitHub Actions;
5. aplicación de migraciones EF Core;
6. estado de las migraciones.

## Estado de Fase 5

- Arquitectura backend: completada.
- PostgreSQL + EF Core: completado.
- Migración inicial: completada.
- Persistencia de simulaciones: completada.
- Casos de uso Application: completados.
- API REST de desarrollo: completada.
- Cliente Angular para API: completado.
- Tests, Docker y CI: completados.

La autenticación, autorización y aislamiento definitivo por usuario corresponden a la **Fase 6**.
