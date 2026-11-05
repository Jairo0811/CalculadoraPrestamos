using System.Net;
using System.Net.Http.Json;
using LoanCalcRD.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LoanCalcRD.Tests;

public sealed class RegistrationAndLoginTests(AuthTestFactory factory) : IClassFixture<AuthTestFactory>
{
    [Theory]
    [InlineData("no-es-un-correo")]
    [InlineData("Nombre <persona@example.test>")]
    [InlineData("")]
    public async Task Register_InvalidEmail_ReturnsValidationProblem(string email)
    {
        using var client = factory.CreateApiClient();
        using var response = await client.PostAsJsonAsync("/api/v1/auth/register", new { email, password = AuthFlow.Password });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_email", await AuthFlow.ReadProblemCodeAsync(response));
    }

    [Theory]
    [InlineData("corta1!A")]
    [InlineData("sinnumerosnisimbolos")]
    [InlineData("SINMINUSCULAS2026!!")]
    public async Task Register_WeakPassword_ReturnsTranslatedErrors(string password)
    {
        using var client = factory.CreateApiClient();
        using var response = await client.PostAsJsonAsync("/api/v1/auth/register", new { email = AuthFlow.NewEmail(), password });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("weak_password", await AuthFlow.ReadProblemCodeAsync(response));
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("\"password\"", body);
        Assert.DoesNotContain("Passwords must", body);
    }

    [Fact]
    public async Task Register_Valid_SendsConfirmationAndCreatesUnconfirmedAccount()
    {
        using var client = factory.CreateApiClient();
        var email = AuthFlow.NewEmail("valid");
        using var response = await client.PostAsJsonAsync("/api/v1/auth/register", new { email, password = AuthFlow.Password });
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);

        var message = await factory.Emails.WaitForAsync(email, 1);
        Assert.Equal("confirmation", message.Kind);

        using var scope = factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<LoanCalcUser>>();
        var user = await users.FindByEmailAsync(email);
        Assert.NotNull(user);
        Assert.False(user.EmailConfirmed);
        Assert.NotEqual(AuthFlow.Password, user.PasswordHash);
    }

    [Fact]
    public async Task Register_Duplicate_IsIndistinguishableFromNewAccount()
    {
        using var client = factory.CreateApiClient();
        var existing = AuthFlow.NewEmail("dup");
        await AuthFlow.RegisterAndConfirmAsync(client, factory, existing);

        using var newResponse = await client.PostAsJsonAsync("/api/v1/auth/register", new { email = AuthFlow.NewEmail("fresh"), password = AuthFlow.Password });
        using var duplicate = await client.PostAsJsonAsync("/api/v1/auth/register", new { email = existing, password = AuthFlow.Password });
        Assert.Equal(newResponse.StatusCode, duplicate.StatusCode);
        Assert.Equal(await newResponse.Content.ReadAsStringAsync(), await duplicate.Content.ReadAsStringAsync());

        // Una contraseña débil se rechaza igual con correos existentes y nuevos.
        using var weakExisting = await client.PostAsJsonAsync("/api/v1/auth/register", new { email = existing, password = "debil" });
        using var weakNew = await client.PostAsJsonAsync("/api/v1/auth/register", new { email = AuthFlow.NewEmail("weak"), password = "debil" });
        Assert.Equal(HttpStatusCode.BadRequest, weakExisting.StatusCode);
        Assert.Equal(weakNew.StatusCode, weakExisting.StatusCode);
        Assert.Equal(await AuthFlow.ReadProblemCodeAsync(weakNew), await AuthFlow.ReadProblemCodeAsync(weakExisting));

        // El titular real recibe un aviso en lugar de un segundo registro.
        var notice = await factory.Emails.WaitForAsync(existing, 2);
        Assert.Equal("existing-account", notice.Kind);
    }

    [Fact]
    public async Task Login_CorrectAndIncorrectCredentials()
    {
        using var client = factory.CreateApiClient();
        var email = AuthFlow.NewEmail("login");
        await AuthFlow.RegisterAndConfirmAsync(client, factory, email);

        var session = await AuthFlow.LoginAsync(client, email);
        using var me = await AuthFlow.SendAsync(client, HttpMethod.Get, "/api/v1/auth/me", session.AccessToken);
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        var profile = await me.Content.ReadAsStringAsync();
        Assert.Contains(email, profile);
        Assert.DoesNotContain("passwordHash", profile, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("securityStamp", profile, StringComparison.OrdinalIgnoreCase);

        using var wrong = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = "Incorrecta!2026Pass" });
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        Assert.Equal("invalid_credentials", await AuthFlow.ReadProblemCodeAsync(wrong));

        using var unknown = await client.PostAsJsonAsync("/api/v1/auth/login", new { email = AuthFlow.NewEmail("nobody"), password = AuthFlow.Password });
        Assert.Equal(HttpStatusCode.Unauthorized, unknown.StatusCode);
        Assert.Equal("invalid_credentials", await AuthFlow.ReadProblemCodeAsync(unknown));
    }

    [Fact]
    public async Task Login_LocksAccountAfterRepeatedFailures()
    {
        using var client = factory.CreateApiClient();
        var email = AuthFlow.NewEmail("lockout");
        await AuthFlow.RegisterAndConfirmAsync(client, factory, email);

        for (var i = 0; i < 5; i++)
        {
            using var failed = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = "Incorrecta!2026Pass" });
            Assert.Equal(HttpStatusCode.Unauthorized, failed.StatusCode);
        }

        // Con la cuenta bloqueada, incluso la contraseña correcta se rechaza con la respuesta genérica.
        using var locked = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = AuthFlow.Password });
        Assert.Equal(HttpStatusCode.Unauthorized, locked.StatusCode);
        Assert.Equal("invalid_credentials", await AuthFlow.ReadProblemCodeAsync(locked));

        using var scope = factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<LoanCalcUser>>();
        Assert.True(await users.IsLockedOutAsync((await users.FindByEmailAsync(email))!));
    }

    [Fact]
    public async Task Login_UnconfirmedAccount_RevealsStateOnlyWithCorrectPassword()
    {
        using var client = factory.CreateApiClient();
        var email = AuthFlow.NewEmail("pending");
        using var registered = await client.PostAsJsonAsync("/api/v1/auth/register", new { email, password = AuthFlow.Password });
        Assert.Equal(HttpStatusCode.Accepted, registered.StatusCode);

        using var correct = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = AuthFlow.Password });
        Assert.Equal(HttpStatusCode.Forbidden, correct.StatusCode);
        Assert.Equal("email_not_confirmed", await AuthFlow.ReadProblemCodeAsync(correct));
        Assert.False(correct.Headers.Contains("Set-Cookie"));

        using var wrong = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = "Incorrecta!2026Pass" });
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        Assert.Equal("invalid_credentials", await AuthFlow.ReadProblemCodeAsync(wrong));
    }

    [Fact]
    public async Task ConfirmEmail_InvalidTokenRejected_ValidTokenConfirms()
    {
        using var client = factory.CreateApiClient();
        var email = AuthFlow.NewEmail("confirm");
        using var registered = await client.PostAsJsonAsync("/api/v1/auth/register", new { email, password = AuthFlow.Password });
        var message = await factory.Emails.WaitForAsync(email, 1);
        var (userId, _) = CapturedAccountEmailSender.ParseLink(message);

        using var forged = await client.PostAsJsonAsync("/api/v1/auth/confirm-email", new { userId, token = "dG9rZW4tZmFsc28" });
        Assert.Equal(HttpStatusCode.BadRequest, forged.StatusCode);
        Assert.Equal("invalid_link", await AuthFlow.ReadProblemCodeAsync(forged));

        using var unknownUser = await client.PostAsJsonAsync("/api/v1/auth/confirm-email", new { userId = Guid.NewGuid(), token = "dG9rZW4" });
        Assert.Equal(HttpStatusCode.BadRequest, unknownUser.StatusCode);

        await AuthFlow.ConfirmAsync(client, message);
        await AuthFlow.LoginAsync(client, email);
    }

    [Fact]
    public async Task ResendConfirmation_SendsNewLink_AndIsNeutralForUnknownEmails()
    {
        using var client = factory.CreateApiClient();
        var email = AuthFlow.NewEmail("resend");
        using var registered = await client.PostAsJsonAsync("/api/v1/auth/register", new { email, password = AuthFlow.Password });
        await factory.Emails.WaitForAsync(email, 1);

        using var resent = await client.PostAsJsonAsync("/api/v1/auth/resend-confirmation", new { email });
        var unknownEmail = AuthFlow.NewEmail("ghost");
        using var unknown = await client.PostAsJsonAsync("/api/v1/auth/resend-confirmation", new { email = unknownEmail });
        Assert.Equal(HttpStatusCode.Accepted, resent.StatusCode);
        Assert.Equal(await resent.Content.ReadAsStringAsync(), await unknown.Content.ReadAsStringAsync());

        var second = await factory.Emails.WaitForAsync(email, 2);
        Assert.Equal("confirmation", second.Kind);
        await AuthFlow.ConfirmAsync(client, second);
        await AuthFlow.LoginAsync(client, email);
        await factory.Emails.AssertNoMoreAsync(unknownEmail, 0);

        // Una cuenta ya confirmada no recibe más enlaces de confirmación.
        using var again = await client.PostAsJsonAsync("/api/v1/auth/resend-confirmation", new { email });
        Assert.Equal(HttpStatusCode.Accepted, again.StatusCode);
        await factory.Emails.AssertNoMoreAsync(email, 2);
    }
}
