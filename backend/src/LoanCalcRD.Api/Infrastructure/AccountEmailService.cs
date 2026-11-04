using System.Net;
using System.Net.Mail;
using System.Text;
using LoanCalcRD.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;

namespace LoanCalcRD.Api.Infrastructure;

public interface IAccountEmailSender
{
    bool IsConfigured { get; }
    Task SendAsync(string recipient, string subject, string body, CancellationToken cancellationToken);
}

// TLS es obligatorio. No almacenamos contraseñas SMTP ni tokens en el repositorio o los logs.
public sealed class SmtpAccountEmailSender(IConfiguration configuration) : IAccountEmailSender
{
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(configuration["Smtp:Host"]) &&
        !string.IsNullOrWhiteSpace(configuration["Smtp:From"]) &&
        !string.IsNullOrWhiteSpace(configuration["Smtp:Username"]) &&
        !string.IsNullOrWhiteSpace(configuration["Smtp:Password"]);

    public async Task SendAsync(string recipient, string subject, string body, CancellationToken cancellationToken)
    {
        if (!IsConfigured) throw new InvalidOperationException("SMTP no está configurado.");
        using var message = new MailMessage(
            configuration["Smtp:From"]!, recipient, subject, body);
        using var client = new SmtpClient(configuration["Smtp:Host"]!,
            int.TryParse(configuration["Smtp:Port"], out var port) ? port : 587)
        {
            EnableSsl = true,
            Credentials = new NetworkCredential(
                configuration["Smtp:Username"], configuration["Smtp:Password"])
        };
        await client.SendMailAsync(message, cancellationToken);
    }
}

public sealed class AccountEmailService(
    IAccountEmailSender sender, IConfiguration configuration,
    UserManager<LoanCalcUser> users, IHostEnvironment environment)
{
    public bool IsConfigured => sender.IsConfigured;

    public async Task SendConfirmationAsync(LoanCalcUser user, CancellationToken ct = default)
    {
        var token = await users.GenerateEmailConfirmationTokenAsync(user);
        var link = Link("confirm", user.Id.ToString(), token, user.Email);
        await sender.SendAsync(user.Email!, "Confirma tu cuenta en LoanCalc RD",
            "Abre este enlace para confirmar tu correo en LoanCalc RD:\n" + link, ct);
    }

    public async Task SendPasswordResetAsync(LoanCalcUser user, CancellationToken ct = default)
    {
        var token = await users.GeneratePasswordResetTokenAsync(user);
        var link = Link("reset", user.Id.ToString(), token, user.Email);
        await sender.SendAsync(user.Email!, "Recupera tu cuenta de LoanCalc RD",
            "Recibimos una solicitud para restablecer la contraseña. Si no fuiste tú, ignora este mensaje.\n" + link, ct);
    }

    private string Link(string action, string userId, string token, string? email)
    {
        var url = configuration["Auth:FrontendAccountUrl"] ?? string.Empty;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var parsed) ||
            (!environment.IsDevelopment() && parsed.Scheme != Uri.UriSchemeHttps))
        {
            throw new InvalidOperationException("Auth:FrontendAccountUrl debe ser una URL absoluta HTTPS en producción.");
        }
        return QueryHelpers.AddQueryString(url, new Dictionary<string, string?>
        {
            ["action"] = action,
            ["userId"] = userId,
            ["email"] = email,
            ["token"] = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token))
        });
    }

    public static string? Decode(string? encoded)
    {
        if (string.IsNullOrWhiteSpace(encoded) || encoded.Length > 8192) return null;
        try { return Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(encoded)); }
        catch (FormatException) { return null; }
    }
}
