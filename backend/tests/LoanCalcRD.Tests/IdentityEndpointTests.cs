using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.WebUtilities;
using Xunit;

namespace LoanCalcRD.Tests;

public sealed class IdentityEndpointTests(AuthTestFactory factory)
    : IClassFixture<AuthTestFactory>
{
    [Fact]
    public async Task OwnerScopedApi_RejectsAnonymousAndOtherUserAccess()
    {
        using var client = factory.CreateClient();

        var anonymous = await client.GetAsync("/api/v1/simulations");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);

        var ownerToken = await RegisterAndLogin(client);
        var otherToken = await RegisterAndLogin(client);

        using var create = await Send(client, HttpMethod.Post, "/api/v1/simulations", ownerToken, new
        {
            name = "Solo para el titular",
            loanType = 1,
            amount = 150000,
            annualRate = 15,
            termMonths = 36
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);

        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var id = created.RootElement.GetProperty("id").GetGuid();
        var url = $"/api/v1/simulations/{id}";

        using var ownRead = await Send(client, HttpMethod.Get, url, ownerToken);
        Assert.Equal(HttpStatusCode.OK, ownRead.StatusCode);

        using var otherRead = await Send(client, HttpMethod.Get, url, otherToken);
        Assert.Equal(HttpStatusCode.NotFound, otherRead.StatusCode);

        using var otherRename = await Send(client, HttpMethod.Patch, url + "/name", otherToken, new { name = "No autorizado" });
        Assert.Equal(HttpStatusCode.NotFound, otherRename.StatusCode);

        using var otherFavorite = await Send(client, HttpMethod.Patch, url + "/favorite", otherToken, new { isFavorite = true });
        Assert.Equal(HttpStatusCode.NotFound, otherFavorite.StatusCode);

        using var otherDelete = await Send(client, HttpMethod.Delete, url, otherToken);
        Assert.Equal(HttpStatusCode.NotFound, otherDelete.StatusCode);

        using var ownerStillCanRead = await Send(client, HttpMethod.Get, url, ownerToken);
        Assert.Equal(HttpStatusCode.OK, ownerStillCanRead.StatusCode);

        using var ownerDelete = await Send(client, HttpMethod.Delete, url, ownerToken);
        Assert.Equal(HttpStatusCode.NoContent, ownerDelete.StatusCode);
    }

    [Fact]
    public async Task InvalidBearerToken_IsRejected()
    {
        using var client = factory.CreateClient();
        using var response = await Send(client, HttpMethod.Get, "/api/v1/simulations", "invalid.jwt.token");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task RefreshRotation_ReplayRevokesEntireSession()
    {
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
        using var login = await RegisterConfirmedAndLogin(client);

        var cookie = ExtractRefreshCookie(login);
        using var rotated = await SendWithCookie(client, "/api/v1/auth/refresh", cookie);
        Assert.Equal(HttpStatusCode.OK, rotated.StatusCode);
        var replacementCookie = ExtractRefreshCookie(rotated);
        using var refreshedJson = JsonDocument.Parse(await rotated.Content.ReadAsStringAsync());
        var replacementJwt = refreshedJson.RootElement.GetProperty("accessToken").GetString()!;

        using var success = await Send(client, HttpMethod.Get, "/api/v1/simulations", replacementJwt);
        Assert.Equal(HttpStatusCode.OK, success.StatusCode);

        // A consumed refresh token is a replay and revokes the whole session.
        using var replay = await SendWithCookie(client, "/api/v1/auth/refresh", cookie);
        Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);
        using var nowInvalid = await Send(client, HttpMethod.Get, "/api/v1/simulations", replacementJwt);
        Assert.Equal(HttpStatusCode.Unauthorized, nowInvalid.StatusCode);
        using var rejectedRefresh = await SendWithCookie(client, "/api/v1/auth/refresh", replacementCookie);
        Assert.Equal(HttpStatusCode.Unauthorized, rejectedRefresh.StatusCode);
    }

    [Fact]
    public async Task LogoutRevokesJwt_AndRefreshRequiresAntiCsrfHeader()
    {
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
        using var login = await RegisterConfirmedAndLogin(client);
        using var loginJson = JsonDocument.Parse(await login.Content.ReadAsStringAsync());
        var jwt = loginJson.RootElement.GetProperty("accessToken").GetString()!;
        var cookie = ExtractRefreshCookie(login);

        using var noCsrf = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/refresh");
        noCsrf.Headers.Add("Cookie", cookie);
        using var bad = await client.SendAsync(noCsrf);
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);

        using var logout = await SendWithCookie(client, "/api/v1/auth/logout", cookie);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        using var rejected = await Send(client, HttpMethod.Get, "/api/v1/simulations", jwt);
        Assert.Equal(HttpStatusCode.Unauthorized, rejected.StatusCode);
    }

    private static string ExtractRefreshCookie(HttpResponseMessage response)
    {
        var setCookies = response.Headers.GetValues("Set-Cookie");
        var cookie = setCookies.First(value => value.StartsWith("loancalcrd_refresh=", StringComparison.Ordinal));
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        return cookie.Split(';')[0];
    }

    private static async Task<HttpResponseMessage> SendWithCookie(HttpClient client, string path, string cookie)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, path);
        request.Headers.Add("Cookie", cookie);
        request.Headers.Add("X-LoanCalc-CSRF", "1");
        return await client.SendAsync(request);
    }

    private async Task<string> RegisterAndLogin(HttpClient client)
    {
        using var login = await RegisterConfirmedAndLogin(client);
        using var data = JsonDocument.Parse(await login.Content.ReadAsStringAsync());
        var token = data.RootElement.GetProperty("accessToken").GetString();
        Assert.False(string.IsNullOrWhiteSpace(token));
        return token!;
    }

    private async Task<HttpResponseMessage> RegisterConfirmedAndLogin(HttpClient client)
    {
        var email = $"test-{Guid.NewGuid():N}@example.test";
        const string password = "Seguro!2026PassWord";

        using var registration = await client.PostAsJsonAsync("/api/v1/auth/register", new { email, password });
        Assert.Equal(HttpStatusCode.Accepted, registration.StatusCode);

        var confirmationLink = new Uri(factory.Emails.GetLastLink(email));
        var query = QueryHelpers.ParseQuery(confirmationLink.Query);
        using var confirmed = await client.PostAsJsonAsync("/api/v1/auth/confirm-email", new
        {
            userId = query["userId"].ToString(),
            token = query["token"].ToString()
        });
        Assert.Equal(HttpStatusCode.OK, confirmed.StatusCode);

        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        return login;
    }

    private static async Task<HttpResponseMessage> Send(
        HttpClient client, HttpMethod method, string path, string token, object? body = null)
    {
        using var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (body is not null) request.Content = JsonContent.Create(body);
        return await client.SendAsync(request);
    }
}
