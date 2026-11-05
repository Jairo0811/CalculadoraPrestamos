using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LoanCalcRD.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LoanCalcRD.Tests;

public sealed class SimulationAuthorizationTests(AuthTestFactory factory) : IClassFixture<AuthTestFactory>
{
    [Fact]
    public async Task PrivateEndpoints_RejectAnonymousRequests()
    {
        using var client = factory.CreateApiClient();
        var id = Guid.NewGuid();
        var requests = new (HttpMethod Method, string Path)[]
        {
            (HttpMethod.Get, "/api/v1/simulations"),
            (HttpMethod.Get, $"/api/v1/simulations/{id}"),
            (HttpMethod.Post, "/api/v1/simulations"),
            (HttpMethod.Patch, $"/api/v1/simulations/{id}/name"),
            (HttpMethod.Patch, $"/api/v1/simulations/{id}/favorite"),
            (HttpMethod.Delete, $"/api/v1/simulations/{id}"),
            (HttpMethod.Get, "/api/v1/auth/me"),
            (HttpMethod.Post, "/api/v1/auth/logout-all"),
            (HttpMethod.Post, "/api/v1/auth/change-password")
        };

        foreach (var (method, path) in requests)
        {
            using var request = new HttpRequestMessage(method, path);
            if (method != HttpMethod.Get && method != HttpMethod.Delete) request.Content = JsonContent.Create(new { });
            using var response = await client.SendAsync(request);
            Assert.True(response.StatusCode == HttpStatusCode.Unauthorized, $"{method} {path} devolvió {(int)response.StatusCode}");
        }
    }

    [Fact]
    public async Task OwnerScopedApi_PreventsCrossUserAccess()
    {
        using var client = factory.CreateApiClient();
        var owner = await AuthFlow.NewConfirmedSessionAsync(client, factory, "owner");
        var intruder = await AuthFlow.NewConfirmedSessionAsync(client, factory, "intruder");

        using var create = await AuthFlow.SendAsync(client, HttpMethod.Post, "/api/v1/simulations", owner.AccessToken,
            AuthFlow.SampleSimulation("Solo para el titular"));
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var id = created.RootElement.GetProperty("id").GetGuid();
        var url = $"/api/v1/simulations/{id}";

        using var ownRead = await AuthFlow.SendAsync(client, HttpMethod.Get, url, owner.AccessToken);
        Assert.Equal(HttpStatusCode.OK, ownRead.StatusCode);

        using var otherRead = await AuthFlow.SendAsync(client, HttpMethod.Get, url, intruder.AccessToken);
        Assert.Equal(HttpStatusCode.NotFound, otherRead.StatusCode);
        using var otherRename = await AuthFlow.SendAsync(client, HttpMethod.Patch, url + "/name", intruder.AccessToken, new { name = "No autorizado" });
        Assert.Equal(HttpStatusCode.NotFound, otherRename.StatusCode);
        using var otherFavorite = await AuthFlow.SendAsync(client, HttpMethod.Patch, url + "/favorite", intruder.AccessToken, new { isFavorite = true });
        Assert.Equal(HttpStatusCode.NotFound, otherFavorite.StatusCode);
        using var otherDelete = await AuthFlow.SendAsync(client, HttpMethod.Delete, url, intruder.AccessToken);
        Assert.Equal(HttpStatusCode.NotFound, otherDelete.StatusCode);

        using var otherList = await AuthFlow.SendAsync(client, HttpMethod.Get, "/api/v1/simulations", intruder.AccessToken);
        Assert.DoesNotContain(id.ToString(), await otherList.Content.ReadAsStringAsync());

        // Un userId enviado por el cliente se ignora: la simulación pertenece siempre al usuario del JWT.
        using var spoofed = await AuthFlow.SendAsync(client, HttpMethod.Post, "/api/v1/simulations", intruder.AccessToken, new
        {
            userId = created.RootElement.GetProperty("userId").GetGuid(),
            name = "Intento de suplantación",
            loanType = 2,
            amount = 90000,
            annualRate = 12,
            termMonths = 24
        });
        Assert.Equal(HttpStatusCode.Created, spoofed.StatusCode);
        using var spoofedJson = JsonDocument.Parse(await spoofed.Content.ReadAsStringAsync());
        Assert.NotEqual(created.RootElement.GetProperty("userId").GetGuid(), spoofedJson.RootElement.GetProperty("userId").GetGuid());

        using var ownerList = await AuthFlow.SendAsync(client, HttpMethod.Get, "/api/v1/simulations", owner.AccessToken);
        using var ownerItems = JsonDocument.Parse(await ownerList.Content.ReadAsStringAsync());
        Assert.Single(ownerItems.RootElement.EnumerateArray());

        // El titular conserva control total.
        using var rename = await AuthFlow.SendAsync(client, HttpMethod.Patch, url + "/name", owner.AccessToken, new { name = "Renombrada" });
        Assert.Equal(HttpStatusCode.OK, rename.StatusCode);
        using var favorite = await AuthFlow.SendAsync(client, HttpMethod.Patch, url + "/favorite", owner.AccessToken, new { isFavorite = true });
        Assert.Equal(HttpStatusCode.OK, favorite.StatusCode);
        using var ownerDelete = await AuthFlow.SendAsync(client, HttpMethod.Delete, url, owner.AccessToken);
        Assert.Equal(HttpStatusCode.NoContent, ownerDelete.StatusCode);
    }

    [Fact]
    public async Task Simulation_IsPersistedInPostgreSql()
    {
        using var client = factory.CreateApiClient();
        var owner = await AuthFlow.NewConfirmedSessionAsync(client, factory, "persist");

        using var create = await AuthFlow.SendAsync(client, HttpMethod.Post, "/api/v1/simulations", owner.AccessToken, new
        {
            name = "Hipoteca en PostgreSQL",
            loanType = 2,
            amount = 4_500_000.55m,
            annualRate = 11.25m,
            termMonths = 240
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var id = created.RootElement.GetProperty("id").GetGuid();

        // Lectura directa de la base (nuevo contexto, sin caché de seguimiento).
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LoanCalcDbContext>();
        var row = await db.LoanSimulations.AsNoTracking().SingleAsync(s => s.Id == id);
        var ownerId = (await db.Users.AsNoTracking().SingleAsync(u => u.Email == owner.Email)).Id;
        Assert.Equal(ownerId, row.UserId);
        Assert.Equal(4_500_000.55m, row.Amount);
        Assert.Equal(11.25m, row.AnnualRate);
        Assert.Equal(240, row.TermMonths);
        Assert.Equal("Hipoteca en PostgreSQL", row.Name);
    }

    [Theory]
    [InlineData(0, 15, 36, 1)]
    [InlineData(150000, -1, 36, 1)]
    [InlineData(150000, 15, 0, 1)]
    [InlineData(150000, 15, 601, 1)]
    [InlineData(150000, 15, 36, 99)]
    public async Task CreateSimulation_InvalidValues_ReturnSpanishValidationProblem(double amount, double rate, int term, int loanType)
    {
        using var client = factory.CreateApiClient();
        var owner = await AuthFlow.NewConfirmedSessionAsync(client, factory, "invalid");
        using var response = await AuthFlow.SendAsync(client, HttpMethod.Post, "/api/v1/simulations", owner.AccessToken, new
        {
            name = "Inválida",
            loanType,
            amount = (decimal)amount,
            annualRate = (decimal)rate,
            termMonths = term
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("validation_failed", await AuthFlow.ReadProblemCodeAsync(response));
        var body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("Parameter '", body);
        Assert.DoesNotContain("StackTrace", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task CreateSimulation_NameTooLong_IsRejectedBeforeDatabase()
    {
        using var client = factory.CreateApiClient();
        var owner = await AuthFlow.NewConfirmedSessionAsync(client, factory, "longname");
        using var response = await AuthFlow.SendAsync(client, HttpMethod.Post, "/api/v1/simulations", owner.AccessToken,
            AuthFlow.SampleSimulation(new string('x', 121)));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task MalformedJson_ReturnsBadRequestWithoutInternalDetails()
    {
        using var client = factory.CreateApiClient();
        var owner = await AuthFlow.NewConfirmedSessionAsync(client, factory, "malformed");
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/simulations")
        {
            Content = new StringContent("{\"name\": ", System.Text.Encoding.UTF8, "application/json")
        };
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", owner.AccessToken);
        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.DoesNotContain("Npgsql", await response.Content.ReadAsStringAsync());
    }
}
