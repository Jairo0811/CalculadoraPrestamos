namespace LoanCalcRD.Api.Infrastructure;

/// <summary>
/// Respuestas de error en formato Problem Details (RFC 9457) con un código estable
/// en <c>extensions.code</c> que el frontend traduce a mensajes comprensibles.
/// Nunca incluyen detalles internos, trazas ni información de otras cuentas.
/// </summary>
public static class ApiProblems
{
    public static IResult Create(int status, string code, string detail, IDictionary<string, string[]>? errors = null)
    {
        var extensions = new Dictionary<string, object?> { ["code"] = code };
        return errors is null
            ? Results.Problem(detail: detail, statusCode: status, title: Title(status), extensions: extensions)
            : Results.ValidationProblem(errors, detail: detail, statusCode: status, title: Title(status), extensions: extensions);
    }

    public static IResult Validation(string code, string detail, string field, params string[] messages) =>
        Create(StatusCodes.Status400BadRequest, code, detail,
            new Dictionary<string, string[]> { [field] = messages.Length > 0 ? messages : [detail] });

    public static IResult InvalidCredentials() => Create(StatusCodes.Status401Unauthorized, "invalid_credentials",
        "Correo o contraseña incorrectos. Tras varios intentos fallidos la cuenta se bloquea temporalmente por seguridad.");

    public static IResult SessionExpired() => Create(StatusCodes.Status401Unauthorized, "session_expired",
        "Tu sesión expiró o fue cerrada. Inicia sesión nuevamente.");

    public static IResult InvalidLink() => Create(StatusCodes.Status400BadRequest, "invalid_link",
        "El enlace es inválido, ya fue utilizado o ha expirado. Solicita uno nuevo.");

    public static IResult CsrfRejected() => Create(StatusCodes.Status403Forbidden, "csrf_rejected",
        "La solicitud no pudo verificarse. Recarga la página e inténtalo de nuevo.");

    public static IResult EmailUnavailable() => Create(StatusCodes.Status503ServiceUnavailable, "email_unavailable",
        "El servicio de correo no está disponible en este momento. Inténtalo más tarde.");

    private static string Title(int status) => status switch
    {
        400 => "Solicitud inválida",
        401 => "No autenticado",
        403 => "Acceso denegado",
        404 => "No encontrado",
        429 => "Demasiadas solicitudes",
        503 => "Servicio no disponible",
        _ => "Error"
    };
}
