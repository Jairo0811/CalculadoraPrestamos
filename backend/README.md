# LoanCalc RD Backend

Backend inicial de LoanCalc RD v3 construido con **ASP.NET Core 10**, **Entity Framework Core 10** y **PostgreSQL**.

## Arquitectura

```text
backend/
├── src/
│   ├── LoanCalcRD.Domain/
│   ├── LoanCalcRD.Application/
│   ├── LoanCalcRD.Infrastructure/
│   └── LoanCalcRD.Api/
└── docker-compose.yml
```

### Responsabilidades

- **Domain:** entidades y reglas de negocio puras.
- **Application:** contratos y casos de uso.
- **Infrastructure:** EF Core, PostgreSQL y repositorios.
- **Api:** composición, configuración HTTP y endpoints.

## Requisitos

- .NET 10 SDK
- Docker Desktop

## Base de datos local

Desde `backend`:

```powershell
docker compose up -d postgres
```

Configura la conexión mediante una variable de entorno. No se almacenan credenciales de producción en el repositorio.

PowerShell:

```powershell
$env:ConnectionStrings__LoanCalcDb="Host=localhost;Port=5432;Database=loancalcrd;Username=loancalc;Password=loancalc_dev"
```

## Restaurar y compilar

```powershell
dotnet restore src/LoanCalcRD.Api/LoanCalcRD.Api.csproj
dotnet build src/LoanCalcRD.Api/LoanCalcRD.Api.csproj
```

## Crear la migración inicial

```powershell
dotnet tool install --global dotnet-ef

dotnet ef migrations add InitialCreate `
  --project src/LoanCalcRD.Infrastructure/LoanCalcRD.Infrastructure.csproj `
  --startup-project src/LoanCalcRD.Api/LoanCalcRD.Api.csproj `
  --output-dir Persistence/Migrations
```

## Aplicar migraciones

```powershell
dotnet ef database update `
  --project src/LoanCalcRD.Infrastructure/LoanCalcRD.Infrastructure.csproj `
  --startup-project src/LoanCalcRD.Api/LoanCalcRD.Api.csproj
```

## Ejecutar API

```powershell
dotnet run --project src/LoanCalcRD.Api/LoanCalcRD.Api.csproj
```

Endpoints iniciales:

- `GET /health`
- `GET /api/v1/system/database`

La autenticación y autorización se incorporarán en la Fase 6. Hasta entonces no se exponen endpoints de datos de usuario.
