using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using LoanCalcRD.Api.Infrastructure;
using LoanCalcRD.Infrastructure.Identity;
using LoanCalcRD.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace LoanCalcRD.Tests;

public sealed class TokenAndSessionTests(AuthTestFactory factory) : IClassFixture<AuthTestFactory>
{
    [Fact]
    public async Task Jwt_ExpiredTamperedForeignAndUnsignedTokens_AreRejected()
    {
        using var client = factory.CreateApiClient();
        var session = await AuthFlow.NewConfirmedSessionAsync(client, factory, "jwt");
        var settings = factory.Services.GetRequiredService<IOptions<JwtSettings>>().Value;
        var claims = new JwtSecurityTokenHandler().ReadJwtToken(session.AccessToken).Claims.ToList();
        var now = DateTime.UtcNow;

        var expired = Sign(settings.SigningKey, settings, claims, now.AddMinutes(-20), now.AddMinutes(-5));
        var foreignKey = Sign(Convert.ToBase64String(RandomNumberGenerator.GetBytes(48)), settings, claims, now, now.AddMinutes(10));
        var wrongAudience = Sign(settings.SigningKey, new JwtSettings { Issuer = settings.Issuer, Audience = "otra-app" }, claims, now, now.AddMinutes(10));

        var parts = session.AccessToken.Split('.');
        var forgedPayload = Base64UrlEncoder.Encode(Encoding.UTF8.GetBytes(
            Base64UrlEncoder.Decode(parts[1]).Replace(claims.First(c => c.Type == "sub").Value, Guid.NewGuid().ToString())));
        var tampered = $"{parts[0]}.{forgedPayload}.{parts[2]}";
        var unsigned = $"{Base64UrlEncoder.Encode("{\"alg\":\"none\",\"typ\":\"JWT\"}")}.{parts[1]}.";

        foreach (var token in new[] { expired, foreignKey, wrongAudience, tampered, unsigned, "invalid.jwt.token" })
        {
            using var response = await AuthFlow.SendAsync(client, HttpMethod.Get, "/api/v1/simulations", token);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        using var valid = await AuthFlow.SendAsync(client, HttpMethod.Get, "/api/v1/simulations", session.AccessToken);
        Assert.Equal(HttpStatusCode.OK, valid.StatusCode);
    }

    [Fact]
    public async Task Jwt_OfDeletedUser_IsRejected()
    {
        using var client = factory.CreateApiClient();
        var session = await AuthFlow.NewConfirmedSessionAsync(client, factory, "deleted");

        using (var scope = factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<LoanCalcUser>>();
            var user = await users.FindByEmailAsync(session.Email);
            Assert.True((await users.DeleteAsync(user!)).Succeeded);
        }

        using var response = await AuthFlow.SendAsync(client, HttpMethod.Get, "/api/v1/auth/me", session.AccessToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        using var refresh = await AuthFlow.RefreshAsync(client, session.RefreshCookie);
        Assert.Equal(HttpStatusCode.Unauthorized, refresh.StatusCode);
    }

    [Fact]
    public async Task Refresh_RotatesToken_AndReplayRevokesWholeSession()
    {
        using var client = factory.CreateApiClient();
        var session = await AuthFlow.NewConfirmedSessionAsync(client, factory, "rotate");

        using var rotated = await AuthFlow.RefreshAsync(client, session.RefreshCookie);
        Assert.Equal(HttpStatusCode.OK, rotated.StatusCode);
        var replacementCookie = AuthFlow.RefreshCookieFrom(rotated);
        var replacementJwt = await AuthFlow.ReadAccessTokenAsync(rotated);
        Assert.NotEqual(session.RefreshCookie, replacementCookie);

        using var success = await AuthFlow.SendAsync(client, HttpMethod.Get, "/api/v1/simulations", replacementJwt);
        Assert.Equal(HttpStatusCode.OK, success.StatusCode);

        // Reutilizar un token consumido revoca la familia completa.
        using var replay = await AuthFlow.RefreshAsync(client, session.RefreshCookie);
        Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);
        Assert.Equal("session_expired", await AuthFlow.ReadProblemCodeAsync(replay));
        Assert.Contains("1970", AuthFlow.RefreshSetCookie(replay));

        using var nowInvalid = await AuthFlow.SendAsync(client, HttpMethod.Get, "/api/v1/simulations", replacementJwt);
        Assert.Equal(HttpStatusCode.Unauthorized, nowInvalid.StatusCode);
        using var rejectedRefresh = await AuthFlow.RefreshAsync(client, replacementCookie);
        Assert.Equal(HttpStatusCode.Unauthorized, rejectedRefresh.StatusCode);
    }

    [Fact]
    public async Task Refresh_ConcurrentUseOfSameToken_NeverYieldsTwoValidTokens()
    {
        using var client = factory.CreateApiClient();
        var session = await AuthFlow.NewConfirmedSessionAsync(client, factory, "race");

        var responses = await Task.WhenAll(Enumerable.Range(0, 8)
            .Select(_ => AuthFlow.RefreshAsync(client, session.RefreshCookie)));
        try
        {
            var winners = responses.Where(r => r.StatusCode == HttpStatusCode.OK).ToList();
            Assert.True(winners.Count <= 1, $"Se obtuvieron {winners.Count} renovaciones con el mismo token.");
            Assert.All(responses.Where(r => r.StatusCode != HttpStatusCode.OK),
                r => Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode));

            // Los perdedores detectan reutilización y revocan la familia: ni siquiera el ganador conserva un token válido.
            foreach (var winner in winners)
            {
                using var afterRace = await AuthFlow.RefreshAsync(client, AuthFlow.RefreshCookieFrom(winner));
                Assert.Equal(HttpStatusCode.Unauthorized, afterRace.StatusCode);
            }

            using var scope = factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<LoanCalcDbContext>();
            var userId = (await db.Users.AsNoTracking().SingleAsync(u => u.Email == session.Email)).Id;
            var activeSessions = await db.AuthSessions.AsNoTracking()
                .CountAsync(s => s.UserId == userId && s.RevokedAtUtc == null);
            Assert.Equal(0, activeSessions);
        }
        finally
        {
            foreach (var response in responses) response.Dispose();
        }
    }

    [Fact]
    public async Task Logout_RevokesServerSession_AndClearsCookie()
    {
        using var client = factory.CreateApiClient();
        var session = await AuthFlow.NewConfirmedSessionAsync(client, factory, "logout");

        using var logout = await AuthFlow.PostWithCookieAsync(client, "/api/v1/auth/logout", session.RefreshCookie);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        Assert.Contains("1970", AuthFlow.RefreshSetCookie(logout));

        using var jwt = await AuthFlow.SendAsync(client, HttpMethod.Get, "/api/v1/simulations", session.AccessToken);
        Assert.Equal(HttpStatusCode.Unauthorized, jwt.StatusCode);
        using var refresh = await AuthFlow.RefreshAsync(client, session.RefreshCookie);
        Assert.Equal(HttpStatusCode.Unauthorized, refresh.StatusCode);

        // Logout sin cookie es idempotente.
        using var again = await AuthFlow.PostWithCookieAsync(client, "/api/v1/auth/logout", cookie: null);
        Assert.Equal(HttpStatusCode.NoContent, again.StatusCode);
    }

    [Fact]
    public async Task LogoutAll_RevokesEverySessionOfTheUserOnly()
    {
        using var client = factory.CreateApiClient();
        var deviceA = await AuthFlow.NewConfirmedSessionAsync(client, factory, "all");
        var deviceB = await AuthFlow.LoginAsync(client, deviceA.Email);
        var otherUser = await AuthFlow.NewConfirmedSessionAsync(client, factory, "bystander");

        using var withoutCsrf = await AuthFlow.SendAsync(client, HttpMethod.Post, "/api/v1/auth/logout-all", deviceA.AccessToken);
        Assert.Equal(HttpStatusCode.Forbidden, withoutCsrf.StatusCode);

        using var logoutAll = await AuthFlow.SendAsync(client, HttpMethod.Post, "/api/v1/auth/logout-all", deviceA.AccessToken, csrf: true);
        Assert.Equal(HttpStatusCode.NoContent, logoutAll.StatusCode);

        foreach (var token in new[] { deviceA.AccessToken, deviceB.AccessToken })
        {
            using var rejected = await AuthFlow.SendAsync(client, HttpMethod.Get, "/api/v1/simulations", token);
            Assert.Equal(HttpStatusCode.Unauthorized, rejected.StatusCode);
        }
        using var refreshB = await AuthFlow.RefreshAsync(client, deviceB.RefreshCookie);
        Assert.Equal(HttpStatusCode.Unauthorized, refreshB.StatusCode);

        using var bystander = await AuthFlow.SendAsync(client, HttpMethod.Get, "/api/v1/simulations", otherUser.AccessToken);
        Assert.Equal(HttpStatusCode.OK, bystander.StatusCode);
    }

    [Fact]
    public async Task Login_BeyondSessionLimit_RevokesOldestSession()
    {
        using var client = factory.CreateApiClient();
        var first = await AuthFlow.NewConfirmedSessionAsync(client, factory, "limit");
        var limit = factory.Services.GetRequiredService<IOptionsMonitor<AuthSettings>>().CurrentValue.MaxActiveSessionsPerUser;

        LoginSession latest = first;
        for (var i = 0; i < limit; i++) latest = await AuthFlow.LoginAsync(client, first.Email);

        using var oldest = await AuthFlow.SendAsync(client, HttpMethod.Get, "/api/v1/auth/me", first.AccessToken);
        Assert.Equal(HttpStatusCode.Unauthorized, oldest.StatusCode);
        using var newest = await AuthFlow.SendAsync(client, HttpMethod.Get, "/api/v1/auth/me", latest.AccessToken);
        Assert.Equal(HttpStatusCode.OK, newest.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LoanCalcDbContext>();
        var userId = (await db.Users.AsNoTracking().SingleAsync(u => u.Email == first.Email)).Id;
        Assert.Equal(limit, await db.AuthSessions.CountAsync(s => s.UserId == userId && s.RevokedAtUtc == null));
    }

    [Fact]
    public async Task Cleanup_RemovesExpiredAndRevokedSessions_WithTheirRefreshTokens()
    {
        using var client = factory.CreateApiClient();
        var session = await AuthFlow.NewConfirmedSessionAsync(client, factory, "cleanup");
        Guid userId;
        var stale = Guid.NewGuid();
        var revoked = Guid.NewGuid();

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LoanCalcDbContext>();
            userId = (await db.Users.AsNoTracking().SingleAsync(u => u.Email == session.Email)).Id;
            var old = DateTimeOffset.UtcNow.AddDays(-60);
            db.AuthSessions.Add(new AuthSession { Id = stale, UserId = userId, CreatedAtUtc = old, ExpiresAtUtc = old.AddDays(14) });
            db.AuthSessions.Add(new AuthSession { Id = revoked, UserId = userId, CreatedAtUtc = old, ExpiresAtUtc = DateTimeOffset.UtcNow.AddDays(5), RevokedAtUtc = old });
            db.RefreshTokens.Add(new RefreshToken
            {
                Id = Guid.NewGuid(), SessionId = stale, TokenHash = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)),
                CreatedAtUtc = old, ExpiresAtUtc = old.AddDays(14)
            });
            await db.SaveChangesAsync();
        }

        var removed = await factory.Services.GetRequiredService<SessionCleanupService>().CleanupOnceAsync();
        Assert.True(removed >= 2);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LoanCalcDbContext>();
            Assert.False(await db.AuthSessions.AnyAsync(s => s.Id == stale || s.Id == revoked));
            Assert.False(await db.RefreshTokens.AnyAsync(t => t.SessionId == stale));
            Assert.True(await db.AuthSessions.AnyAsync(s => s.UserId == userId && s.RevokedAtUtc == null));
        }
    }

    private static string Sign(string key, JwtSettings settings, IEnumerable<Claim> claims, DateTime notBefore, DateTime expires)
    {
        var filtered = claims.Where(c => c.Type is not ("exp" or "nbf" or "iat" or "iss" or "aud"));
        var token = new JwtSecurityToken(settings.Issuer, settings.Audience, filtered, notBefore, expires,
            new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
