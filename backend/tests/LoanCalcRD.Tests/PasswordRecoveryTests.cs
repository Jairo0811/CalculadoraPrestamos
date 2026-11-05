using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace LoanCalcRD.Tests;

public sealed class PasswordRecoveryTests(AuthTestFactory factory) : IClassFixture<AuthTestFactory>
{
    private const string NewPassword = "Nuevo!2026PassWord";

    [Fact]
    public async Task ResetPassword_RevokesSessions_AndLinkIsSingleUse()
    {
        using var client = factory.CreateApiClient();
        var session = await AuthFlow.NewConfirmedSessionAsync(client, factory, "recovery");
        var email = session.Email;

        using var forgot = await client.PostAsJsonAsync("/api/v1/auth/forgot-password", new { email });
        Assert.Equal(HttpStatusCode.Accepted, forgot.StatusCode);
        var resetMessage = await factory.Emails.WaitForAsync(email, 2);
        Assert.Equal("password-reset", resetMessage.Kind);
        var (userId, token) = CapturedAccountEmailSender.ParseLink(resetMessage);

        using var weak = await client.PostAsJsonAsync("/api/v1/auth/reset-password", new { userId, token, newPassword = "debil" });
        Assert.Equal(HttpStatusCode.BadRequest, weak.StatusCode);
        Assert.Equal("weak_password", await AuthFlow.ReadProblemCodeAsync(weak));

        using var reset = await client.PostAsJsonAsync("/api/v1/auth/reset-password", new { userId, token, newPassword = NewPassword });
        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);

        // El mismo enlace no puede reutilizarse.
        using var reused = await client.PostAsJsonAsync("/api/v1/auth/reset-password", new { userId, token, newPassword = "Otra!2026PassWord" });
        Assert.Equal(HttpStatusCode.BadRequest, reused.StatusCode);
        Assert.Equal("invalid_link", await AuthFlow.ReadProblemCodeAsync(reused));

        // Sesiones previas revocadas: JWT y refresh dejan de funcionar.
        using var oldAccess = await AuthFlow.SendAsync(client, HttpMethod.Get, "/api/v1/simulations", session.AccessToken);
        Assert.Equal(HttpStatusCode.Unauthorized, oldAccess.StatusCode);
        using var oldRefresh = await AuthFlow.RefreshAsync(client, session.RefreshCookie);
        Assert.Equal(HttpStatusCode.Unauthorized, oldRefresh.StatusCode);

        using var oldLogin = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = AuthFlow.Password });
        Assert.Equal(HttpStatusCode.Unauthorized, oldLogin.StatusCode);
        await AuthFlow.LoginAsync(client, email, NewPassword);

        var notice = await factory.Emails.WaitForAsync(email, 3);
        Assert.Equal("password-changed", notice.Kind);
    }

    [Fact]
    public async Task ResetPassword_InvalidOrForgedToken_IsRejected()
    {
        using var client = factory.CreateApiClient();
        var session = await AuthFlow.NewConfirmedSessionAsync(client, factory, "forged");
        var confirmation = await factory.Emails.WaitForAsync(session.Email, 1);
        var (userId, confirmationToken) = CapturedAccountEmailSender.ParseLink(confirmation);

        using var garbage = await client.PostAsJsonAsync("/api/v1/auth/reset-password", new { userId, token = "no-es-base64-%%", newPassword = NewPassword });
        Assert.Equal(HttpStatusCode.BadRequest, garbage.StatusCode);
        Assert.Equal("invalid_link", await AuthFlow.ReadProblemCodeAsync(garbage));

        // Un token de confirmación (otro propósito) no sirve para restablecer la contraseña.
        using var wrongPurpose = await client.PostAsJsonAsync("/api/v1/auth/reset-password", new { userId, token = confirmationToken, newPassword = NewPassword });
        Assert.Equal(HttpStatusCode.BadRequest, wrongPurpose.StatusCode);

        using var unknownUser = await client.PostAsJsonAsync("/api/v1/auth/reset-password", new { userId = Guid.NewGuid(), token = confirmationToken, newPassword = NewPassword });
        Assert.Equal(HttpStatusCode.BadRequest, unknownUser.StatusCode);

        await AuthFlow.LoginAsync(client, session.Email);
    }

    [Fact]
    public async Task ForgotPassword_IsNeutralForUnknownAccounts()
    {
        using var client = factory.CreateApiClient();
        var session = await AuthFlow.NewConfirmedSessionAsync(client, factory, "neutral");
        var unknownEmail = AuthFlow.NewEmail("unknown");

        using var known = await client.PostAsJsonAsync("/api/v1/auth/forgot-password", new { email = session.Email });
        using var unknown = await client.PostAsJsonAsync("/api/v1/auth/forgot-password", new { email = unknownEmail });
        using var malformed = await client.PostAsJsonAsync("/api/v1/auth/forgot-password", new { email = "no-valido" });

        Assert.Equal(HttpStatusCode.Accepted, known.StatusCode);
        var expected = await known.Content.ReadAsStringAsync();
        Assert.Equal(expected, await unknown.Content.ReadAsStringAsync());
        Assert.Equal(expected, await malformed.Content.ReadAsStringAsync());
        await factory.Emails.WaitForAsync(session.Email, 2);
        await factory.Emails.AssertNoMoreAsync(unknownEmail, 0);
    }

    [Fact]
    public async Task ChangePassword_RequiresCurrentPassword_AndRevokesEverySession()
    {
        using var client = factory.CreateApiClient();
        var deviceA = await AuthFlow.NewConfirmedSessionAsync(client, factory, "change");
        var deviceB = await AuthFlow.LoginAsync(client, deviceA.Email);

        using var anonymous = await client.PostAsJsonAsync("/api/v1/auth/change-password",
            new { currentPassword = AuthFlow.Password, newPassword = NewPassword });
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);

        using var wrongCurrent = await AuthFlow.SendAsync(client, HttpMethod.Post, "/api/v1/auth/change-password", deviceA.AccessToken,
            new { currentPassword = "Incorrecta!2026Pass", newPassword = NewPassword });
        Assert.Equal(HttpStatusCode.BadRequest, wrongCurrent.StatusCode);
        Assert.Equal("invalid_current_password", await AuthFlow.ReadProblemCodeAsync(wrongCurrent));

        using var weak = await AuthFlow.SendAsync(client, HttpMethod.Post, "/api/v1/auth/change-password", deviceA.AccessToken,
            new { currentPassword = AuthFlow.Password, newPassword = "debil" });
        Assert.Equal("weak_password", await AuthFlow.ReadProblemCodeAsync(weak));

        using var changed = await AuthFlow.SendAsync(client, HttpMethod.Post, "/api/v1/auth/change-password", deviceA.AccessToken,
            new { currentPassword = AuthFlow.Password, newPassword = NewPassword });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        var newAccess = await AuthFlow.ReadAccessTokenAsync(changed);
        var newCookie = AuthFlow.RefreshCookieFrom(changed);

        foreach (var oldToken in new[] { deviceA.AccessToken, deviceB.AccessToken })
        {
            using var rejected = await AuthFlow.SendAsync(client, HttpMethod.Get, "/api/v1/auth/me", oldToken);
            Assert.Equal(HttpStatusCode.Unauthorized, rejected.StatusCode);
        }
        using var oldRefresh = await AuthFlow.RefreshAsync(client, deviceB.RefreshCookie);
        Assert.Equal(HttpStatusCode.Unauthorized, oldRefresh.StatusCode);

        using var current = await AuthFlow.SendAsync(client, HttpMethod.Get, "/api/v1/auth/me", newAccess);
        Assert.Equal(HttpStatusCode.OK, current.StatusCode);
        using var rotated = await AuthFlow.RefreshAsync(client, newCookie);
        Assert.Equal(HttpStatusCode.OK, rotated.StatusCode);

        using var oldPassword = await client.PostAsJsonAsync("/api/v1/auth/login", new { email = deviceA.Email, password = AuthFlow.Password });
        Assert.Equal(HttpStatusCode.Unauthorized, oldPassword.StatusCode);
        await AuthFlow.LoginAsync(client, deviceA.Email, NewPassword);
    }
}
