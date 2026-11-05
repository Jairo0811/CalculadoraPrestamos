using System.Text.Json;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace LoanCalcRD.Api.Infrastructure;

/// <summary>
/// Convierte las validaciones del dominio (ArgumentException) en 400 Problem Details
/// con el mensaje en español, sin trazas ni el sufijo técnico "(Parameter '...')".
/// </summary>
public sealed class ValidationExceptionHandler(
    IProblemDetailsService problemDetailsService,
    ILogger<ValidationExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        if (exception is not ArgumentException argumentException)
        {
            return false;
        }

        logger.LogInformation("Solicitud inválida en {Path}: {Parameter}", httpContext.Request.Path, argumentException.ParamName);

        var detail = CleanMessage(argumentException);
        var field = string.IsNullOrWhiteSpace(argumentException.ParamName)
            ? "request"
            : JsonNamingPolicy.CamelCase.ConvertName(argumentException.ParamName);

        httpContext.Response.StatusCode = StatusCodes.Status400BadRequest;
        var problem = new ValidationProblemDetails(new Dictionary<string, string[]> { [field] = [detail] })
        {
            Status = StatusCodes.Status400BadRequest,
            Title = "Solicitud inválida",
            Detail = detail
        };
        problem.Extensions["code"] = "validation_failed";

        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception
        });
    }

    internal static string CleanMessage(ArgumentException exception)
    {
        var message = exception.Message;
        if (!string.IsNullOrEmpty(exception.ParamName))
        {
            var suffix = $" (Parameter '{exception.ParamName}')";
            var index = message.IndexOf(suffix, StringComparison.Ordinal);
            if (index >= 0) message = message[..index];
        }
        return message.Trim();
    }
}
