namespace LoanCalcRD.Api.Infrastructure;

// Opciones tipadas. Los secretos (Jwt:SigningKey, Smtp:Password, cadena de conexión)
// llegan exclusivamente por variables de entorno o User Secrets; nunca desde appsettings.

public sealed class JwtSettings
{
    public const string SectionName = "Jwt";
    public string Issuer { get; set; } = "LoanCalcRD";
    public string Audience { get; set; } = "LoanCalcRD.Web";
    public string SigningKey { get; set; } = string.Empty;
    public int AccessTokenMinutes { get; set; } = 15;
}

public sealed class AuthSettings
{
    public const string SectionName = "Auth";

    /// <summary>Página de cuenta del frontend que recibe los enlaces de confirmación y recuperación.</summary>
    public string FrontendAccountUrl { get; set; } = string.Empty;

    /// <summary>Vigencia absoluta de una sesión. La rotación nunca la extiende.</summary>
    public int RefreshTokenDays { get; set; } = 14;

    /// <summary>Máximo de sesiones activas por usuario; las más antiguas se revocan.</summary>
    public int MaxActiveSessionsPerUser { get; set; } = 10;

    /// <summary>Días que se conservan sesiones expiradas o revocadas antes de eliminarlas.</summary>
    public int SessionRetentionDays { get; set; } = 7;

    public bool SessionCleanupEnabled { get; set; } = true;

    public int EmailTokenLifespanHours { get; set; } = 2;

    public AuthCookieSettings Cookie { get; set; } = new();
}

public sealed class AuthCookieSettings
{
    /// <summary>
    /// Strict (por defecto) cuando frontend y API comparten sitio o se usa un proxy de mismo origen.
    /// None solo para dominios distintos; en ese caso la cookie siempre es Secure.
    /// </summary>
    public string SameSite { get; set; } = "Strict";

    public SameSiteMode ResolveSameSite() => SameSite?.Trim().ToLowerInvariant() switch
    {
        "none" => SameSiteMode.None,
        "lax" => SameSiteMode.Lax,
        _ => SameSiteMode.Strict
    };
}

public sealed class SmtpSettings
{
    public const string SectionName = "Smtp";
    public string? Host { get; set; }
    public int Port { get; set; } = 587;
    public string? From { get; set; }
    public string FromName { get; set; } = "LoanCalc RD";
    public string? Username { get; set; }
    public string? Password { get; set; }
    public int TimeoutSeconds { get; set; } = 15;

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(Host) && !string.IsNullOrWhiteSpace(From);
}

public sealed class RateLimitSettings
{
    public const string SectionName = "RateLimiting";
    public RateLimitRule Login { get; set; } = new() { PermitLimit = 10, WindowSeconds = 60 };
    public RateLimitRule Registration { get; set; } = new() { PermitLimit = 5, WindowSeconds = 60 };
    public RateLimitRule Verification { get; set; } = new() { PermitLimit = 12, WindowSeconds = 60 };
    public RateLimitRule Recovery { get; set; } = new() { PermitLimit = 6, WindowSeconds = 60 };
    public RateLimitRule Session { get; set; } = new() { PermitLimit = 30, WindowSeconds = 60 };
    public RateLimitRule Api { get; set; } = new() { PermitLimit = 120, WindowSeconds = 60 };
}

public sealed class RateLimitRule
{
    public int PermitLimit { get; set; } = 10;
    public int WindowSeconds { get; set; } = 60;
}
