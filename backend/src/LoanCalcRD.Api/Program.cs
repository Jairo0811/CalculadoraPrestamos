using LoanCalcRD.Api.Infrastructure;
using LoanCalcRD.Application.Loans;
using LoanCalcRD.Infrastructure;
using LoanCalcRD.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHealthChecks();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ValidationExceptionHandler>();
builder.Services.AddScoped<LoanSimulationService>();

var connectionString = builder.Configuration.GetConnectionString("LoanCalcDb")
    ?? throw new InvalidOperationException("La cadena de conexión 'LoanCalcDb' no está configurada.");

builder.Services.AddInfrastructure(connectionString);

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        var allowedOrigins = builder.Configuration
            .GetSection("Cors:AllowedOrigins")
            .Get<string[]>() ?? [];

        if (allowedOrigins.Length > 0)
        {
            policy.WithOrigins(allowedOrigins)
                .AllowAnyHeader()
                .AllowAnyMethod();
        }
    });
});

var app = builder.Build();

app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseCors("Frontend");

if (app.Environment.IsDevelopment())
{
    var simulations = app.MapGroup("/api/v1/dev/users/{userId:guid}/simulations")
        .WithTags("Development - Loan Simulations");

    simulations.MapGet("/", async (
        Guid userId,
        LoanSimulationService service,
        CancellationToken cancellationToken) =>
    {
        var items = await service.GetByUserAsync(userId, cancellationToken);
        return Results.Ok(items);
    });

    simulations.MapGet("/{id:guid}", async (
        Guid userId,
        Guid id,
        LoanSimulationService service,
        CancellationToken cancellationToken) =>
    {
        var item = await service.GetByIdAsync(id, userId, cancellationToken);
        return item is null ? Results.NotFound() : Results.Ok(item);
    });

    simulations.MapPost("/", async (
        Guid userId,
        CreateLoanSimulationRequest request,
        LoanSimulationService service,
        CancellationToken cancellationToken) =>
    {
        var created = await service.CreateAsync(
            userId,
            request,
            DateTimeOffset.UtcNow,
            cancellationToken);

        return Results.Created(
            $"/api/v1/dev/users/{userId}/simulations/{created.Id}",
            created);
    });

    simulations.MapPatch("/{id:guid}/name", async (
        Guid userId,
        Guid id,
        RenameLoanSimulationRequest request,
        LoanSimulationService service,
        CancellationToken cancellationToken) =>
    {
        var updated = await service.RenameAsync(
            id,
            userId,
            request,
            DateTimeOffset.UtcNow,
            cancellationToken);

        return updated is null ? Results.NotFound() : Results.Ok(updated);
    });

    simulations.MapPatch("/{id:guid}/favorite", async (
        Guid userId,
        Guid id,
        SetFavoriteLoanSimulationRequest request,
        LoanSimulationService service,
        CancellationToken cancellationToken) =>
    {
        var updated = await service.SetFavoriteAsync(
            id,
            userId,
            request,
            DateTimeOffset.UtcNow,
            cancellationToken);

        return updated is null ? Results.NotFound() : Results.Ok(updated);
    });

    simulations.MapDelete("/{id:guid}", async (
        Guid userId,
        Guid id,
        LoanSimulationService service,
        CancellationToken cancellationToken) =>
    {
        var deleted = await service.DeleteAsync(id, userId, cancellationToken);
        return deleted ? Results.NoContent() : Results.NotFound();
    });
}

app.MapHealthChecks("/health");

app.MapGet("/api/v1/system/database", async (
    LoanCalcDbContext dbContext,
    CancellationToken cancellationToken) =>
{
    var canConnect = await dbContext.Database.CanConnectAsync(cancellationToken);

    return canConnect
        ? Results.Ok(new { database = "available" })
        : Results.Problem("No fue posible conectar con PostgreSQL.");
})
.WithName("DatabaseHealth");

app.Run();
