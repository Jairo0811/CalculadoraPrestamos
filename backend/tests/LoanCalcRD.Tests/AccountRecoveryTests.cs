using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Xunit;

namespace LoanCalcRD.Tests;

public sealed class AccountRecoveryTests(AuthTestFactory factory) : IClassFixture<AuthTestFactory>
{
    [Fact]
    public async Task EmailConfirmationAndResetPassword_RevokeActiveSessions()
    {
        using var client = factory.CreateClient();
        var email = $"recovery-{Guid.NewGuid():N}@example.test";
        const string oldPassword = "Seguro!2026PassWord";
        const string newPassword = "Nuevo!2026PassWord";

        using var registered = await client.PostAsJsonAsync("/api/v1/auth/register", new { email, password = oldPassword });
        Assert.Equal(HttpStatusCode.Accepted, registered.StatusCode);

        using var beforeConfirm = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = oldPassword });
        Assert.Equal(HttpStatusCode.Unauthorized, beforeConfirm.StatusCode);

        var confirmLink = new Uri(factory.Emails.GetLastLink(email));
        var confirmQuery = QueryHelpers.ParseQuery(confirmLink.Query);
        using var confirmed = await client.PostAsJsonAsync("/api/v1/auth/confirm-email", new
        {
            userId = confirmQuery["userId"].ToString(),
            token = confirmQuery["token"].ToString()
        });
        Assert.Equal(HttpStatusCode.OK, confirmed.StatusCode);

        using var loggedIn = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = oldPassword });
        Assert.Equal(HttpStatusCode.OK, loggedIn.StatusCode);
        using var loginJson = JsonDocument.Parse(await loggedIn.Content.ReadAsStringAsync());
        var previousJwt = loginJson.RootElement.GetProperty("accessToken").GetString()!;

        using var forgot = await client.PostAsJsonAsync("/api/v1/auth/forgot-password", new { email });
        Assert.Equal(HttpStatusCode.Accepted, forgot.StatusCode);
        var resetLink = new Uri(factory.Emails.GetLastLink(email));
        var resetQuery = QueryHelpers.ParseQuery(resetLink.Query);

        using var reset = await client.PostAsJsonAsync("/api/v1/auth/reset-password", new
        {
            email,
            token = resetQuery["token"].ToString(),
            newPassword
        });
        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);

        using var oldLogin = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = oldPassword });
        Assert.Equal(HttpStatusCode.Unauthorized, oldLogin.StatusCode);

        using var invalidated = new HttpRequestMessage(HttpMethod.Get, "/api/v1/simulations");
        invalidated.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", previousJwt);
        using var oldAccess = await client.SendAsync(invalidated);
        Assert.Equal(HttpStatusCode.Unauthorized, oldAccess.StatusCode);

        using var newLogin = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = newPassword });
        Assert.Equal(HttpStatusCode.OK, newLogin.StatusCode);
    }
}
