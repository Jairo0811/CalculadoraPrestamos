using LoanCalcRD.Api.Extensions;
using LoanCalcRD.Api.Infrastructure;
using LoanCalcRD.Application.Loans;

namespace LoanCalcRD.Api.Endpoints;

/// <summary>
/// Simulaciones privadas. El propietario se obtiene SIEMPRE del JWT validado; ningún endpoint
/// acepta un userId del cliente. Un recurso de otro usuario responde 404 (no se confirma su existencia).
/// </summary>
public static class SimulationEndpoints
{
    public static IEndpointRouteBuilder MapSimulationEndpoints(this IEndpointRouteBuilder app)
    {
        var simulations = app.MapGroup("/api/v1/simulations")
            .WithTags("Loan Simulations")
            .RequireAuthorization()
            .RequireRateLimiting(RateLimitPolicies.Api);

        simulations.MapGet("/", async (HttpContext http, LoanSimulationService service, CancellationToken ct) =>
            AuthEndpoints.TryGetUserId(http.User, out var userId)
                ? Results.Ok(await service.GetByUserAsync(userId, ct))
                : ApiProblems.SessionExpired());

        simulations.MapGet("/{id:guid}", async (HttpContext http, Guid id, LoanSimulationService service, CancellationToken ct) =>
        {
            if (!AuthEndpoints.TryGetUserId(http.User, out var userId)) return ApiProblems.SessionExpired();
            var item = await service.GetByIdAsync(id, userId, ct);
            return item is null ? NotFound() : Results.Ok(item);
        });

        simulations.MapPost("/", async (HttpContext http, CreateLoanSimulationRequest request, LoanSimulationService service,
            TimeProvider time, CancellationToken ct) =>
        {
            if (!AuthEndpoints.TryGetUserId(http.User, out var userId)) return ApiProblems.SessionExpired();
            var created = await service.CreateAsync(userId, request, time.GetUtcNow(), ct);
            return Results.Created($"/api/v1/simulations/{created.Id}", created);
        });

        simulations.MapPatch("/{id:guid}/name", async (HttpContext http, Guid id, RenameLoanSimulationRequest request,
            LoanSimulationService service, TimeProvider time, CancellationToken ct) =>
        {
            if (!AuthEndpoints.TryGetUserId(http.User, out var userId)) return ApiProblems.SessionExpired();
            var updated = await service.RenameAsync(id, userId, request, time.GetUtcNow(), ct);
            return updated is null ? NotFound() : Results.Ok(updated);
        });

        simulations.MapPatch("/{id:guid}/favorite", async (HttpContext http, Guid id, SetFavoriteLoanSimulationRequest request,
            LoanSimulationService service, TimeProvider time, CancellationToken ct) =>
        {
            if (!AuthEndpoints.TryGetUserId(http.User, out var userId)) return ApiProblems.SessionExpired();
            var updated = await service.SetFavoriteAsync(id, userId, request, time.GetUtcNow(), ct);
            return updated is null ? NotFound() : Results.Ok(updated);
        });

        simulations.MapDelete("/{id:guid}", async (HttpContext http, Guid id, LoanSimulationService service, CancellationToken ct) =>
        {
            if (!AuthEndpoints.TryGetUserId(http.User, out var userId)) return ApiProblems.SessionExpired();
            return await service.DeleteAsync(id, userId, ct) ? Results.NoContent() : NotFound();
        });

        return app;
    }

    private static IResult NotFound() => ApiProblems.Create(StatusCodes.Status404NotFound, "not_found",
        "La simulación no existe o no pertenece a tu cuenta.");
}
