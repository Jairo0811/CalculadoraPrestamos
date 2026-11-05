using System.Net;
using System.Net.Http.Json;
using LoanCalcRD.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LoanCalcRD.Tests;

public sealed class SecurityPolicyTests(AuthTestFactory factory) : IClassFixture<AuthTestFactory>
{
    [Fact]
    public async Task Refresh_RequiresAntiCsrfHeader_AndTrustedOrigin()
    {
        using var client = factory.CreateApiClient();
        var session = await AuthFlow.NewConfirmedSessionAsync(client, factory, "csrf");

        using var noHeader = await AuthFlow.PostWithCookieAsync(client, "/api/v1/auth/refresh", session.RefreshCookie, csrf: false);
        Assert.Equal(HttpStatusCode.Forbidden, noHeader.StatusCode);
        Assert.Equal("csrf_rejected", await AuthFlow.ReadProblemCodeAsync(noHeader));

        using var evilOrigin = await AuthFlow.PostWithCookieAsync(client, "/api/v1/auth/refresh", session.RefreshCookie, origin: "https://evil.example");
        Assert.Equal(HttpStatusCode.Forbidden, evilOrigin.StatusCode);

        using var nullOrigin = await AuthFlow.PostWithCookieAsync(client, "/api/v1/auth/refresh", session.RefreshCookie, origin: "null");
        Assert.Equal(HttpStatusCode.Forbidden, nullOrigin.StatusCode);

        using var evilReferer = await AuthFlow.PostWithCookieAsync(client, "/api/v1/auth/refresh", session.RefreshCookie, referer: "https://evil.example/page");
        Assert.Equal(HttpStatusCode.Forbidden, evilReferer.StatusCode);

        using var logoutFromEvil = await AuthFlow.PostWithCookieAsync(client, "/api/v1/auth/logout", session.RefreshCookie, origin: "https://evil.example");
        Assert.Equal(HttpStatusCode.Forbidden, logoutFromEvil.StatusCode);

        // Rechazos CSRF no consumen el token: el origen legítimo sigue pudiendo renovar.
        using var trusted = await AuthFlow.RefreshAsync(client, session.RefreshCookie, origin: AuthFlow.AllowedOrigin);
        Assert.Equal(HttpStatusCode.OK, trusted.StatusCode);
    }

    [Fact]
    public async Task Cors_AllowsOnlyConfiguredOriginWithCredentials()
    {
        using var client = factory.CreateApiClient();

        using var allowed = new HttpRequestMessage(HttpMethod.Options, "/api/v1/auth/refresh");
        allowed.Headers.Add("Origin", AuthFlow.AllowedOrigin);
        allowed.Headers.Add("Access-Control-Request-Method", "POST");
        allowed.Headers.Add("Access-Control-Request-Headers", "x-loancalc-csrf");
        using var allowedResponse = await client.SendAsync(allowed);
        Assert.Equal(AuthFlow.AllowedOrigin, allowedResponse.Headers.GetValues("Access-Control-Allow-Origin").Single());
        Assert.Equal("true", allowedResponse.Headers.GetValues("Access-Control-Allow-Credentials").Single());

        using var denied = new HttpRequestMessage(HttpMethod.Options, "/api/v1/auth/refresh");
        denied.Headers.Add("Origin", "https://evil.example");
        denied.Headers.Add("Access-Control-Request-Method", "POST");
        denied.Headers.Add("Access-Control-Request-Headers", "x-loancalc-csrf");
        using var deniedResponse = await client.SendAsync(denied);
        Assert.False(deniedResponse.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task RefreshCookie_IsHttpOnlyStrictAndPathScoped()
    {
        using var client = factory.CreateApiClient();
        var session = await AuthFlow.NewConfirmedSessionAsync(client, factory, "cookie");
        var cookie = session.SetCookieHeader.ToLowerInvariant();

        Assert.Contains("httponly", cookie);
        Assert.Contains("samesite=strict", cookie);
        Assert.Contains("path=/api/v1/auth", cookie);
        Assert.Contains("expires=", cookie);
        // El token de acceso nunca viaja en cookie y el refresh nunca en el cuerpo.
        Assert.DoesNotContain(session.AccessToken.ToLowerInvariant(), cookie);
    }

    [Fact]
    public async Task AuthResponses_AreNotCacheable_AndCarrySecurityHeaders()
    {
        using var client = factory.CreateApiClient();
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { email = AuthFlow.NewEmail(), password = AuthFlow.Password });
        Assert.Contains("no-store", login.Headers.CacheControl?.ToString() ?? string.Empty);
        Assert.Equal("nosniff", login.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", login.Headers.GetValues("X-Frame-Options").Single());
        Assert.Equal("no-referrer", login.Headers.GetValues("Referrer-Policy").Single());
    }

    [Fact]
    public async Task HealthEndpoints_ReportLivenessAndDatabaseReadiness()
    {
        using var client = factory.CreateApiClient();
        using var live = await client.GetAsync("/health/live");
        Assert.Equal(HttpStatusCode.OK, live.StatusCode);
        using var ready = await client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, ready.StatusCode);
        Assert.Equal("Healthy", await ready.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Migrations_AreFullyAppliedAndMatchTheModel()
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LoanCalcDbContext>();

        var applied = (await db.Database.GetAppliedMigrationsAsync()).ToList();
        Assert.Contains(applied, m => m.EndsWith("_InitialCreate", StringComparison.Ordinal));
        Assert.Contains(applied, m => m.EndsWith("_AddIdentityAccounts", StringComparison.Ordinal));
        Assert.Contains(applied, m => m.EndsWith("_AddRevocableSessions", StringComparison.Ordinal));
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        Assert.False(db.Database.HasPendingModelChanges(), "El modelo EF Core difiere de la última migración.");
    }
}

public sealed class CrossSiteCookieTests(CrossSiteCookieFactory factory) : IClassFixture<CrossSiteCookieFactory>
{
    [Fact]
    public async Task SameSiteNone_ForcesSecureCookie()
    {
        using var client = factory.CreateApiClient();
        var session = await AuthFlow.NewConfirmedSessionAsync(client, factory, "crosssite");
        var cookie = session.SetCookieHeader.ToLowerInvariant();
        Assert.Contains("samesite=none", cookie);
        Assert.Contains("secure", cookie);
        Assert.Contains("httponly", cookie);
    }
}

public sealed class RateLimitTests(StrictRateLimitFactory factory) : IClassFixture<StrictRateLimitFactory>
{
    [Fact]
    public async Task Login_IsThrottledWithRetryAfter()
    {
        using var client = factory.CreateApiClient();
        var body = new { email = AuthFlow.NewEmail("throttle"), password = "Incorrecta!2026Pass" };

        using var first = await client.PostAsJsonAsync("/api/v1/auth/login", body);
        using var second = await client.PostAsJsonAsync("/api/v1/auth/login", body);
        using var third = await client.PostAsJsonAsync("/api/v1/auth/login", body);

        Assert.Equal(HttpStatusCode.Unauthorized, first.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, second.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, third.StatusCode);
        Assert.Equal("too_many_requests", await AuthFlow.ReadProblemCodeAsync(third));
        Assert.True(third.Headers.Contains("Retry-After"));

        // Las políticas son independientes: el límite de login no bloquea la renovación de sesión.
        using var refresh = await AuthFlow.PostWithCookieAsync(client, "/api/v1/auth/refresh", "loancalcrd_refresh=desconocido");
        Assert.Equal(HttpStatusCode.Unauthorized, refresh.StatusCode);
    }
}
