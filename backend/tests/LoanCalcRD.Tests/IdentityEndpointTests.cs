using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace LoanCalcRD.Tests;

public sealed class IdentityEndpointTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
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

    private static async Task<string> RegisterAndLogin(HttpClient client)
    {
        var email = $"test-{Guid.NewGuid():N}@example.test";
        const string password = "Seguro!2026PassWord";

        using var registration = await client.PostAsJsonAsync("/api/v1/auth/register", new { email, password });
        Assert.Equal(HttpStatusCode.Created, registration.StatusCode);

        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);

        using var data = JsonDocument.Parse(await login.Content.ReadAsStringAsync());
        var token = data.RootElement.GetProperty("accessToken").GetString();
        Assert.False(string.IsNullOrWhiteSpace(token));
        return token!;
    }

    private static Task<HttpResponseMessage> Send(
        HttpClient client, HttpMethod method, string path, string token, object? body = null)
    {
        using var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (body is not null) request.Content = JsonContent.Create(body);
        return client.SendAsync(request);
    }
}
