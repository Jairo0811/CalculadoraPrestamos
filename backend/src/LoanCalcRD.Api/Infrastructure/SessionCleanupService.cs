using LoanCalcRD.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace LoanCalcRD.Api.Infrastructure;

/// <summary>
/// Elimina periódicamente sesiones expiradas o revocadas (y sus refresh tokens por cascada)
/// para que las tablas de autenticación no crezcan sin límite.
/// </summary>
public sealed class SessionCleanupService(
    IServiceScopeFactory scopes,
    IOptionsMonitor<AuthSettings> options,
    TimeProvider time,
    ILogger<SessionCleanupService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.CurrentValue.SessionCleanupEnabled) return;

        using var timer = new PeriodicTimer(Interval);
        try
        {
            do
            {
                try
                {
                    var removed = await CleanupOnceAsync(stoppingToken);
                    if (removed > 0) logger.LogInformation("Se eliminaron {Count} sesiones expiradas o revocadas.", removed);
                }
                catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                {
                    logger.LogWarning(ex, "No se pudo completar la limpieza de sesiones.");
                }
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Apagado ordenado.
        }
    }

    public async Task<int> CleanupOnceAsync(CancellationToken cancellationToken = default)
    {
        var retention = Math.Clamp(options.CurrentValue.SessionRetentionDays, 1, 365);
        var cutoff = time.GetUtcNow().AddDays(-retention);

        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LoanCalcDbContext>();
        return await db.AuthSessions
            .Where(x => x.ExpiresAtUtc < cutoff || (x.RevokedAtUtc != null && x.RevokedAtUtc < cutoff))
            .ExecuteDeleteAsync(cancellationToken);
    }
}
