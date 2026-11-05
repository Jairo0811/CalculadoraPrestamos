using LoanCalcRD.Infrastructure.Persistence;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;

namespace LoanCalcRD.Api.Endpoints;

public static class SystemEndpoints
{
    public static IEndpointRouteBuilder MapSystemEndpoints(this IEndpointRouteBuilder app)
    {
        // Liveness: el proceso responde. Readiness: además PostgreSQL acepta conexiones.
        app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
        app.MapHealthChecks("/health");

        app.MapGet("/api/v1/system/database", async (LoanCalcDbContext dbContext, CancellationToken cancellationToken) =>
            await dbContext.Database.CanConnectAsync(cancellationToken)
                ? Results.Ok(new { database = "available" })
                : Results.Problem(detail: "No fue posible conectar con PostgreSQL.", statusCode: StatusCodes.Status503ServiceUnavailable))
            .WithName("DatabaseHealth");

        return app;
    }
}
