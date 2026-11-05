namespace LoanCalcRD.Api.Infrastructure;

/// <summary>
/// Defensa en profundidad para los endpoints que usan la cookie de refresh:
/// 1. Encabezado no simple obligatorio (fuerza preflight CORS en peticiones de otros orígenes).
/// 2. Si el navegador envía Origin (o Referer), debe ser la propia API o un origen permitido.
/// 3. La cookie es HttpOnly, con Path restringido y SameSite configurable.
/// </summary>
public static class CsrfProtection
{
    public const string HeaderName = "X-LoanCalc-CSRF";
    public const string HeaderValue = "1";

    public static bool IsValid(HttpContext http)
    {
        if (!http.Request.Headers.TryGetValue(HeaderName, out var value) || value.ToString() != HeaderValue)
            return false;

        var origin = http.Request.Headers.Origin.ToString();
        if (string.IsNullOrEmpty(origin))
        {
            var referer = http.Request.Headers.Referer.ToString();
            // Clientes no navegador no envían Origin ni Referer y tampoco adjuntan cookies ajenas.
            if (string.IsNullOrEmpty(referer)) return true;
            if (!Uri.TryCreate(referer, UriKind.Absolute, out var refererUri)) return false;
            origin = refererUri.GetLeftPart(UriPartial.Authority);
        }

        if (string.Equals(origin, "null", StringComparison.OrdinalIgnoreCase)) return false;

        var self = $"{http.Request.Scheme}://{http.Request.Host}";
        if (string.Equals(origin.TrimEnd('/'), self, StringComparison.OrdinalIgnoreCase)) return true;

        var allowed = http.RequestServices.GetRequiredService<IConfiguration>()
            .GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
        return allowed.Any(a => string.Equals(a.TrimEnd('/'), origin.TrimEnd('/'), StringComparison.OrdinalIgnoreCase));
    }
}
