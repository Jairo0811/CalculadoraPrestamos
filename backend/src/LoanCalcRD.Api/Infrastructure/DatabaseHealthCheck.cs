using LoanCalcRD.Infrastructure.Persistence;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace LoanCalcRD.Api.Infrastructure;

public sealed class DatabaseHealthCheck(LoanCalcDbContext db) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            return await db.Database.CanConnectAsync(cancellationToken)
                ? HealthCheckResult.Healthy("PostgreSQL disponible.")
                : HealthCheckResult.Unhealthy("PostgreSQL no disponible.");
        }
        catch (Exception)
        {
            // No se expone el detalle de conexión.
            return HealthCheckResult.Unhealthy("PostgreSQL no disponible.");
        }
    }
}
