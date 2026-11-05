using System.Security.Cryptography;
using System.Text;
using LoanCalcRD.Infrastructure.Identity;
using LoanCalcRD.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace LoanCalcRD.Api.Infrastructure;

public sealed record IssuedSession(AccessTokenResponse Access, string RefreshSecret, DateTimeOffset RefreshExpiresAtUtc);

/// <summary>
/// Sesiones revocables por dispositivo con refresh tokens rotatorios de un solo uso.
/// Solo se persiste el hash SHA-256 del secreto. Reutilizar un token consumido revoca la sesión completa.
/// </summary>
public sealed class SessionService(
    LoanCalcDbContext db,
    JwtTokenService jwt,
    IOptionsMonitor<AuthSettings> options,
    TimeProvider time)
{
    public const string CookieName = "loancalcrd_refresh";
    public const string CookiePath = "/api/v1/auth";
    private const int MaxSecretLength = 256;

    public async Task<IssuedSession> CreateAsync(LoanCalcUser user, CancellationToken cancellationToken = default)
    {
        var settings = options.CurrentValue;
        var now = time.GetUtcNow();
        var expires = now.AddDays(Math.Clamp(settings.RefreshTokenDays, 1, 90));

        await EnforceSessionLimitAsync(user.Id, Math.Max(1, settings.MaxActiveSessionsPerUser), now, cancellationToken);

        var session = new AuthSession
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            CreatedAtUtc = now,
            ExpiresAtUtc = expires
        };
        var secret = GenerateSecret();
        db.AuthSessions.Add(session);
        db.RefreshTokens.Add(NewRefresh(session.Id, secret, now, expires));
        await db.SaveChangesAsync(cancellationToken);
        return new IssuedSession(jwt.CreateAccessToken(user, session.Id), secret, expires);
    }

    public async Task<IssuedSession?> RotateAsync(string? secret, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(secret) || secret.Length > MaxSecretLength) return null;
        var hash = Hash(secret);
        var now = time.GetUtcNow();

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var token = await db.RefreshTokens.AsNoTracking()
            .SingleOrDefaultAsync(x => x.TokenHash == hash, cancellationToken);
        if (token is null) return null;

        var session = await db.AuthSessions.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == token.SessionId, cancellationToken);
        if (session is null || session.RevokedAtUtc is not null || session.ExpiresAtUtc <= now)
            return null;

        if (token.ConsumedAtUtc is not null)
        {
            // Reutilización de un token ya rotado: posible robo. Se revoca toda la familia.
            await RevokeSessionAsync(session.Id, now, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return null;
        }

        // Consumo atómico. En PostgreSQL la segunda petición concurrente espera el bloqueo de fila,
        // reevalúa la condición y actualiza 0 filas: nunca pueden ganar dos peticiones con el mismo token.
        var updated = await db.RefreshTokens
            .Where(x => x.Id == token.Id && x.ConsumedAtUtc == null && x.ExpiresAtUtc > now)
            .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.ConsumedAtUtc, now), cancellationToken);

        if (updated != 1)
        {
            await RevokeSessionAsync(session.Id, now, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return null;
        }

        var user = await db.Users.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == session.UserId, cancellationToken);
        if (user is null) return null;

        var replacement = GenerateSecret();
        // La rotación conserva la expiración absoluta de la sesión original.
        db.RefreshTokens.Add(NewRefresh(session.Id, replacement, now, session.ExpiresAtUtc));
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new IssuedSession(jwt.CreateAccessToken(user, session.Id), replacement, session.ExpiresAtUtc);
    }

    public async Task RevokeByRefreshAsync(string? secret, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(secret) || secret.Length > MaxSecretLength) return;
        var hash = Hash(secret);
        var sessionId = await db.RefreshTokens.AsNoTracking()
            .Where(x => x.TokenHash == hash)
            .Select(x => (Guid?)x.SessionId)
            .SingleOrDefaultAsync(cancellationToken);
        if (sessionId is not null)
        {
            await RevokeSessionAsync(sessionId.Value, time.GetUtcNow(), cancellationToken);
        }
    }

    public Task<int> RevokeAllAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var now = time.GetUtcNow();
        return db.AuthSessions
            .Where(x => x.UserId == userId && x.RevokedAtUtc == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAtUtc, now), cancellationToken);
    }

    public Task<bool> IsActiveAsync(Guid sessionId, Guid userId, CancellationToken cancellationToken = default)
    {
        var now = time.GetUtcNow();
        return db.AuthSessions.AsNoTracking().AnyAsync(
            s => s.Id == sessionId && s.UserId == userId && s.RevokedAtUtc == null && s.ExpiresAtUtc > now,
            cancellationToken);
    }

    private async Task EnforceSessionLimitAsync(Guid userId, int maxSessions, DateTimeOffset now, CancellationToken ct)
    {
        // Se deja hueco para la sesión nueva: se revocan las activas más antiguas por encima del límite.
        var overflow = await db.AuthSessions.AsNoTracking()
            .Where(x => x.UserId == userId && x.RevokedAtUtc == null && x.ExpiresAtUtc > now)
            .OrderByDescending(x => x.CreatedAtUtc)
            .Select(x => x.Id)
            .Skip(maxSessions - 1)
            .ToListAsync(ct);
        if (overflow.Count == 0) return;

        await db.AuthSessions
            .Where(x => overflow.Contains(x.Id) && x.RevokedAtUtc == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAtUtc, now), ct);
    }

    private Task<int> RevokeSessionAsync(Guid sessionId, DateTimeOffset now, CancellationToken ct) =>
        db.AuthSessions.Where(x => x.Id == sessionId && x.RevokedAtUtc == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAtUtc, now), ct);

    private static RefreshToken NewRefresh(Guid sessionId, string secret, DateTimeOffset now, DateTimeOffset expires) => new()
    {
        Id = Guid.NewGuid(),
        SessionId = sessionId,
        TokenHash = Hash(secret),
        CreatedAtUtc = now,
        ExpiresAtUtc = expires
    };

    private static string GenerateSecret() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(48))
        .TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static string Hash(string secret) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(secret)));

    public static void SetCookie(HttpContext http, IssuedSession session)
    {
        http.Response.Cookies.Append(CookieName, session.RefreshSecret, BuildCookieOptions(http, session.RefreshExpiresAtUtc));
        http.Response.Headers.CacheControl = "no-store";
    }

    public static void ClearCookie(HttpContext http)
    {
        http.Response.Cookies.Delete(CookieName, BuildCookieOptions(http, expires: null));
        http.Response.Headers.CacheControl = "no-store";
    }

    private static CookieOptions BuildCookieOptions(HttpContext http, DateTimeOffset? expires)
    {
        var services = http.RequestServices;
        var sameSite = services.GetRequiredService<IOptionsMonitor<AuthSettings>>().CurrentValue.Cookie.ResolveSameSite();
        var isDevelopment = services.GetRequiredService<IHostEnvironment>().IsDevelopment();
        return new CookieOptions
        {
            HttpOnly = true,
            // SameSite=None exige Secure en todos los navegadores modernos.
            Secure = sameSite == SameSiteMode.None || !isDevelopment || http.Request.IsHttps,
            SameSite = sameSite,
            Path = CookiePath,
            Expires = expires,
            IsEssential = true
        };
    }
}
