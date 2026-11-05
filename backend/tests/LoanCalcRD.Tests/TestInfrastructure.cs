using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using LoanCalcRD.Api.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace LoanCalcRD.Tests;

/// <summary>
/// Emisor de correo SIMULADO: captura los mensajes en memoria. Estas pruebas verifican el flujo
/// de tokens y enlaces, NO la entrega real por un proveedor SMTP.
/// </summary>
public sealed class CapturedAccountEmailSender : IAccountEmailSender
{
    private readonly ConcurrentDictionary<string, List<AccountEmailMessage>> messages = new(StringComparer.OrdinalIgnoreCase);

    public bool IsConfigured => true;

    public Task SendAsync(AccountEmailMessage message, CancellationToken cancellationToken)
    {
        var list = messages.GetOrAdd(message.Recipient, _ => []);
        lock (list) list.Add(message);
        return Task.CompletedTask;
    }

    public int Count(string recipient)
    {
        if (!messages.TryGetValue(recipient, out var list)) return 0;
        lock (list) return list.Count;
    }

    /// <summary>Espera al mensaje número <paramref name="ordinal"/> (1 = primero) del destinatario.</summary>
    public async Task<AccountEmailMessage> WaitForAsync(string recipient, int ordinal)
    {
        var deadline = DateTime.UtcNow.AddSeconds(15);
        while (DateTime.UtcNow < deadline)
        {
            if (messages.TryGetValue(recipient, out var list))
            {
                lock (list)
                {
                    if (list.Count >= ordinal) return list[ordinal - 1];
                }
            }
            await Task.Delay(25);
        }
        throw new TimeoutException($"No se recibió el correo #{ordinal} de prueba.");
    }

    /// <summary>Comprueba que no llega ningún correo adicional durante una breve ventana.</summary>
    public async Task AssertNoMoreAsync(string recipient, int expectedCount)
    {
        await Task.Delay(300);
        Assert.Equal(expectedCount, Count(recipient));
    }

    public static (string UserId, string Token) ParseLink(AccountEmailMessage message)
    {
        var line = message.Body.Split('\n').Select(l => l.Trim())
            .First(l => l.StartsWith("http", StringComparison.Ordinal) && l.Contains("token=", StringComparison.Ordinal));
        var query = QueryHelpers.ParseQuery(new Uri(line).Query);
        Assert.False(query.ContainsKey("email"), "Los enlaces no deben exponer el correo en la URL.");
        return (query["userId"].ToString(), query["token"].ToString());
    }
}

/// <summary>
/// Host de pruebas sobre PostgreSQL REAL (cadena de conexión del entorno / CI).
/// Límites de solicitudes altos para que las pruebas funcionales no se bloqueen entre sí.
/// </summary>
public class AuthTestFactory : WebApplicationFactory<Program>
{
    public CapturedAccountEmailSender Emails { get; } = new();

    protected virtual IDictionary<string, string?> Settings => new Dictionary<string, string?>
    {
        ["RateLimiting:Login:PermitLimit"] = "100000",
        ["RateLimiting:Registration:PermitLimit"] = "100000",
        ["RateLimiting:Verification:PermitLimit"] = "100000",
        ["RateLimiting:Recovery:PermitLimit"] = "100000",
        ["RateLimiting:Session:PermitLimit"] = "100000",
        ["RateLimiting:Api:PermitLimit"] = "100000"
    };

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(Settings));
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IAccountEmailSender>();
            services.AddSingleton<IAccountEmailSender>(Emails);
        });
    }

    public HttpClient CreateApiClient() =>
        CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
}

public sealed class StrictRateLimitFactory : AuthTestFactory
{
    protected override IDictionary<string, string?> Settings
    {
        get
        {
            var settings = base.Settings;
            settings["RateLimiting:Login:PermitLimit"] = "2";
            settings["RateLimiting:Login:WindowSeconds"] = "60";
            return settings;
        }
    }
}

public sealed class CrossSiteCookieFactory : AuthTestFactory
{
    protected override IDictionary<string, string?> Settings
    {
        get
        {
            var settings = base.Settings;
            settings["Auth:Cookie:SameSite"] = "None";
            return settings;
        }
    }
}

public sealed record LoginSession(string Email, string AccessToken, string RefreshCookie, string SetCookieHeader);

internal static class AuthFlow
{
    public const string Password = "Seguro!2026PassWord";
    public const string AllowedOrigin = "http://localhost:4200";

    public static string NewEmail(string prefix = "test") => $"{prefix}-{Guid.NewGuid():N}@example.test";

    public static async Task RegisterAndConfirmAsync(HttpClient client, AuthTestFactory factory, string email, string password = Password)
    {
        using var registration = await client.PostAsJsonAsync("/api/v1/auth/register", new { email, password });
        Assert.Equal(HttpStatusCode.Accepted, registration.StatusCode);
        await ConfirmAsync(client, await factory.Emails.WaitForAsync(email, 1));
    }

    public static async Task ConfirmAsync(HttpClient client, AccountEmailMessage message)
    {
        var (userId, token) = CapturedAccountEmailSender.ParseLink(message);
        using var confirmed = await client.PostAsJsonAsync("/api/v1/auth/confirm-email", new { userId, token });
        Assert.Equal(HttpStatusCode.OK, confirmed.StatusCode);
    }

    public static async Task<LoginSession> LoginAsync(HttpClient client, string email, string password = Password)
    {
        using var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var accessToken = await ReadAccessTokenAsync(login);
        var setCookie = RefreshSetCookie(login);
        return new LoginSession(email, accessToken, setCookie.Split(';')[0], setCookie);
    }

    public static async Task<LoginSession> NewConfirmedSessionAsync(HttpClient client, AuthTestFactory factory, string prefix = "test")
    {
        var email = NewEmail(prefix);
        await RegisterAndConfirmAsync(client, factory, email);
        return await LoginAsync(client, email);
    }

    public static async Task<string> ReadAccessTokenAsync(HttpResponseMessage response)
    {
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var token = json.RootElement.GetProperty("accessToken").GetString();
        Assert.False(string.IsNullOrWhiteSpace(token));
        return token!;
    }

    public static async Task<string?> ReadProblemCodeAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();
        if (string.IsNullOrWhiteSpace(content)) return null;
        using var json = JsonDocument.Parse(content);
        return json.RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;
    }

    public static string RefreshSetCookie(HttpResponseMessage response) =>
        response.Headers.GetValues("Set-Cookie").First(v => v.StartsWith("loancalcrd_refresh=", StringComparison.Ordinal));

    public static string RefreshCookieFrom(HttpResponseMessage response) => RefreshSetCookie(response).Split(';')[0];

    public static Task<HttpResponseMessage> PostWithCookieAsync(
        HttpClient client, string path, string? cookie, bool csrf = true, string? origin = null, string? referer = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path);
        if (cookie is not null) request.Headers.Add("Cookie", cookie);
        if (csrf) request.Headers.Add("X-LoanCalc-CSRF", "1");
        if (origin is not null) request.Headers.Add("Origin", origin);
        if (referer is not null) request.Headers.Add("Referer", referer);
        return SendAndDisposeAsync(client, request);
    }

    public static Task<HttpResponseMessage> RefreshAsync(HttpClient client, string cookie, string? origin = null) =>
        PostWithCookieAsync(client, "/api/v1/auth/refresh", cookie, origin: origin);

    public static Task<HttpResponseMessage> SendAsync(
        HttpClient client, HttpMethod method, string path, string token, object? body = null, bool csrf = false)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (csrf) request.Headers.Add("X-LoanCalc-CSRF", "1");
        if (body is not null) request.Content = JsonContent.Create(body);
        return SendAndDisposeAsync(client, request);
    }

    private static async Task<HttpResponseMessage> SendAndDisposeAsync(HttpClient client, HttpRequestMessage request)
    {
        using (request)
        {
            return await client.SendAsync(request);
        }
    }

    public static object SampleSimulation(string name = "Préstamo de prueba") => new
    {
        name,
        loanType = 1,
        amount = 150000,
        annualRate = 15,
        termMonths = 36
    };
}
