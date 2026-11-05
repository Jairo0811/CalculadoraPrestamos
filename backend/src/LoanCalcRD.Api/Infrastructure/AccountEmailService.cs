using System.Net;
using System.Net.Mail;
using System.Text;
using System.Threading.Channels;
using LoanCalcRD.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;

namespace LoanCalcRD.Api.Infrastructure;

public sealed record AccountEmailMessage(string Recipient, string Subject, string Body, string Kind);

public interface IAccountEmailSender
{
    bool IsConfigured { get; }
    Task SendAsync(AccountEmailMessage message, CancellationToken cancellationToken);
}

// TLS es obligatorio. No almacenamos contraseñas SMTP ni tokens en el repositorio o los logs.
public sealed class SmtpAccountEmailSender(IOptionsMonitor<SmtpSettings> options) : IAccountEmailSender
{
    public bool IsConfigured => options.CurrentValue.IsConfigured;

    public async Task SendAsync(AccountEmailMessage email, CancellationToken cancellationToken)
    {
        var settings = options.CurrentValue;
        if (!settings.IsConfigured) throw new InvalidOperationException("SMTP no está configurado.");

        using var message = new MailMessage
        {
            From = new MailAddress(settings.From!, settings.FromName),
            Subject = email.Subject,
            Body = email.Body,
            SubjectEncoding = Encoding.UTF8,
            BodyEncoding = Encoding.UTF8,
            IsBodyHtml = false
        };
        message.To.Add(email.Recipient);

        using var client = new SmtpClient(settings.Host!, settings.Port)
        {
            EnableSsl = true,
            DeliveryMethod = SmtpDeliveryMethod.Network,
            Timeout = Math.Clamp(settings.TimeoutSeconds, 5, 120) * 1000
        };
        if (!string.IsNullOrWhiteSpace(settings.Username))
        {
            client.Credentials = new NetworkCredential(settings.Username, settings.Password);
        }

        await client.SendMailAsync(message, cancellationToken);
    }
}

/// <summary>
/// Cola en memoria. Desacopla la respuesta HTTP del proveedor SMTP para que el tiempo de
/// respuesta y los fallos de entrega no revelen si una cuenta existe.
/// </summary>
public sealed class AccountEmailQueue
{
    private readonly Channel<AccountEmailMessage> channel = Channel.CreateBounded<AccountEmailMessage>(
        new BoundedChannelOptions(1000) { FullMode = BoundedChannelFullMode.Wait, SingleReader = true });

    public bool TryEnqueue(AccountEmailMessage message) => channel.Writer.TryWrite(message);

    public ChannelReader<AccountEmailMessage> Reader => channel.Reader;
}

public sealed class AccountEmailDispatcher(
    AccountEmailQueue queue,
    IAccountEmailSender sender,
    ILogger<AccountEmailDispatcher> logger) : BackgroundService
{
    private static readonly TimeSpan[] RetryDelays = [TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(10)];

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var message in queue.Reader.ReadAllAsync(stoppingToken))
            {
                await DeliverAsync(message, stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Apagado ordenado.
        }
    }

    private async Task DeliverAsync(AccountEmailMessage message, CancellationToken stoppingToken)
    {
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                timeout.CancelAfter(TimeSpan.FromSeconds(30));
                await sender.SendAsync(message, timeout.Token);
                logger.LogInformation("Correo de cuenta enviado: {Kind} a {Recipient}", message.Kind, Mask(message.Recipient));
                return;
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                // Nunca se registra el cuerpo: contiene tokens de un solo uso.
                if (attempt >= RetryDelays.Length)
                {
                    logger.LogError("No se pudo entregar el correo {Kind} a {Recipient} tras {Attempts} intentos: {Error}",
                        message.Kind, Mask(message.Recipient), attempt + 1, ex.GetType().Name);
                    return;
                }
                logger.LogWarning("Fallo temporal enviando {Kind} a {Recipient}: {Error}",
                    message.Kind, Mask(message.Recipient), ex.GetType().Name);
                await Task.Delay(RetryDelays[attempt], stoppingToken);
            }
        }
    }

    internal static string Mask(string email)
    {
        var at = email.IndexOf('@');
        if (at < 0) return "***";
        return at <= 1 ? "***" + email[at..] : email[0] + "***" + email[at..];
    }
}

public sealed class AccountEmailService(
    IAccountEmailSender sender,
    AccountEmailQueue queue,
    IOptionsMonitor<AuthSettings> authOptions,
    UserManager<LoanCalcUser> users,
    ILogger<AccountEmailService> logger)
{
    public bool IsConfigured => sender.IsConfigured;

    public async Task QueueConfirmationAsync(LoanCalcUser user)
    {
        var token = await users.GenerateEmailConfirmationTokenAsync(user);
        var link = Link("confirm", user.Id, token);
        Enqueue(user, "Confirma tu cuenta en LoanCalc RD", "confirmation",
            "Hola:\n\nGracias por crear tu cuenta en LoanCalc RD. Para activarla, abre este enlace " +
            $"(vence en {Lifespan()} horas y solo puede usarse una vez):\n\n{link}\n\n" +
            "Si no creaste esta cuenta, ignora este mensaje.");
    }

    public async Task QueuePasswordResetAsync(LoanCalcUser user)
    {
        var token = await users.GeneratePasswordResetTokenAsync(user);
        var link = Link("reset", user.Id, token);
        Enqueue(user, "Restablece tu contraseña de LoanCalc RD", "password-reset",
            "Hola:\n\nRecibimos una solicitud para restablecer tu contraseña. Abre este enlace " +
            $"(vence en {Lifespan()} horas y solo puede usarse una vez):\n\n{link}\n\n" +
            "Si no fuiste tú, ignora este mensaje: tu contraseña actual sigue siendo válida.");
    }

    public void QueueExistingAccountNotice(LoanCalcUser user)
    {
        Enqueue(user, "Ya tienes una cuenta en LoanCalc RD", "existing-account",
            "Hola:\n\nAlguien intentó crear una cuenta de LoanCalc RD con este correo, pero ya existe una. " +
            "Si fuiste tú, inicia sesión o usa la opción «Olvidé mi contraseña».\n\n" +
            "Si no fuiste tú, no necesitas hacer nada.");
    }

    public void QueuePasswordChangedNotice(LoanCalcUser user)
    {
        Enqueue(user, "Tu contraseña de LoanCalc RD cambió", "password-changed",
            "Hola:\n\nLa contraseña de tu cuenta de LoanCalc RD se cambió y todas las sesiones anteriores se cerraron.\n\n" +
            "Si no realizaste este cambio, recupera tu cuenta de inmediato con «Olvidé mi contraseña».");
    }

    private void Enqueue(LoanCalcUser user, string subject, string kind, string body)
    {
        if (!sender.IsConfigured)
        {
            // Los flujos que dependen del correo ya responden 503; aquí solo quedan avisos informativos.
            logger.LogWarning("SMTP no configurado; no se envió el aviso {Kind}.", kind);
            return;
        }
        if (!queue.TryEnqueue(new AccountEmailMessage(user.Email!, subject, body, kind)))
        {
            logger.LogError("Cola de correo llena; se descartó un mensaje {Kind}.", kind);
        }
    }

    private int Lifespan() => Math.Max(1, authOptions.CurrentValue.EmailTokenLifespanHours);

    private string Link(string action, Guid userId, string token)
    {
        var url = authOptions.CurrentValue.FrontendAccountUrl;
        if (!Uri.TryCreate(url, UriKind.Absolute, out _))
        {
            throw new InvalidOperationException("Auth:FrontendAccountUrl debe ser una URL absoluta.");
        }
        // El correo no viaja en la URL: solo el identificador opaco y el token de un solo uso.
        return QueryHelpers.AddQueryString(url, new Dictionary<string, string?>
        {
            ["action"] = action,
            ["userId"] = userId.ToString(),
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
