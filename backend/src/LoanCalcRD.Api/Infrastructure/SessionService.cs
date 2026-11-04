using System.Security.Cryptography;
using System.Text;
using LoanCalcRD.Infrastructure.Identity;
using LoanCalcRD.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LoanCalcRD.Api.Infrastructure;

public sealed record IssuedSession(AccessTokenResponse Access, string RefreshSecret, DateTimeOffset RefreshExpiresAtUtc);

public sealed class SessionService(LoanCalcDbContext db, JwtTokenService jwt)
{
    public const string CookieName = "loancalcrd_refresh";

    public async Task<IssuedSession> CreateAsync(LoanCalcUser user, CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var expires = now.AddDays(14);
        var session = new AuthSession
        {
            Id = Guid.NewGuid(), UserId = user.Id,
            CreatedAtUtc = now, ExpiresAtUtc = expires
        };
        var secret = GenerateSecret();
        db.AuthSessions.Add(session);
        db.RefreshTokens.Add(NewRefresh(session.Id, secret, now, expires));
        await db.SaveChangesAsync(cancellationToken);
        return new IssuedSession(jwt.CreateAccessToken(user, session.Id), secret, expires);
    }

    public async Task<IssuedSession?> RotateAsync(string? secret, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(secret) || secret.Length > 256) return null;
        var hash = Hash(secret);
        var now = DateTimeOffset.UtcNow;

        // Atomic consumption; concurrent/replayed tokens cannot both succeed.
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
            await RevokeFamilyAsync(session.Id, now, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return null;
        }

        var updated = await db.RefreshTokens
            .Where(x => x.Id == token.Id && x.ConsumedAtUtc == null && x.ExpiresAtUtc > now)
            .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.ConsumedAtUtc, now), cancellationToken);

        if (updated != 1)
        {
            await RevokeFamilyAsync(session.Id, now, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return null;
        }

        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == session.UserId, cancellationToken);
        if (user is null) return null;

        var replacement = GenerateSecret();
        db.RefreshTokens.Add(NewRefresh(session.Id, replacement, now, session.ExpiresAtUtc));
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new IssuedSession(jwt.CreateAccessToken(user, session.Id), replacement, session.ExpiresAtUtc);
    }

    public async Task RevokeByRefreshAsync(string? secret, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(secret) || secret.Length > 256) return;
        var hash = Hash(secret);
        var sessionId = await db.RefreshTokens.Where(x => x.TokenHash == hash)
            .Select(x => (Guid?)x.SessionId).SingleOrDefaultAsync(cancellationToken);
        if (sessionId is not null)
        {
            await RevokeFamilyAsync(sessionId.Value, DateTimeOffset.UtcNow, cancellationToken);
        }
    }

    public async Task RevokeAllAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        await db.AuthSessions.Where(x => x.UserId == userId && x.RevokedAtUtc == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAtUtc, DateTimeOffset.UtcNow), cancellationToken);
    }

    private Task<int> RevokeFamilyAsync(Guid sessionId, DateTimeOffset now, CancellationToken ct) =>
        db.AuthSessions.Where(x => x.Id == sessionId && x.RevokedAtUtc == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAtUtc, now), ct);

    private static RefreshToken NewRefresh(Guid sessionId, string secret, DateTimeOffset now, DateTimeOffset expires) => new()
    {
        Id = Guid.NewGuid(), SessionId = sessionId, TokenHash = Hash(secret),
        CreatedAtUtc = now, ExpiresAtUtc = expires
    };

    private static string GenerateSecret() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(48))
        .TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static string Hash(string secret) => Convert.ToHexString(
        SHA256.HashData(Encoding.UTF8.GetBytes(secret)));

    public static void SetCookie(HttpContext http, IssuedSession session)
    {
        http.Response.Cookies.Append(CookieName, session.RefreshSecret, new CookieOptions
        {
            HttpOnly = true,
            Secure = !http.RequestServices.GetRequiredService<IHostEnvironment>().IsDevelopment(),
            SameSite = SameSiteMode.Strict,
            Path = "/api/v1/auth",
            Expires = session.RefreshExpiresAtUtc,
            IsEssential = true
        });
        http.Response.Headers.CacheControl = "no-store";
    }

    public static void ClearCookie(HttpContext http)
    {
        http.Response.Cookies.Delete(CookieName, new CookieOptions
        {
            HttpOnly = true,
            Secure = !http.RequestServices.GetRequiredService<IHostEnvironment>().IsDevelopment(),
            SameSite = SameSiteMode.Strict,
            Path = "/api/v1/auth"
        });
        http.Response.Headers.CacheControl = "no-store";
    }
}
