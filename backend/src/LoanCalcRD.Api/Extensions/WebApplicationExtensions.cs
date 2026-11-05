using LoanCalcRD.Api.Infrastructure;
using Microsoft.Extensions.Options;

namespace LoanCalcRD.Api.Extensions;

public static class WebApplicationExtensions
{
    public static WebApplication UseLoanCalcPipeline(this WebApplication app)
    {
        app.UseForwardedHeaders();
        app.UseExceptionHandler();
        app.UseStatusCodePages();

        if (!app.Environment.IsDevelopment())
        {
            app.UseHsts();
        }

        app.Use(static (context, next) =>
        {
            // API JSON: sin contenido incrustable ni ejecutable.
            var headers = context.Response.Headers;
            headers["X-Content-Type-Options"] = "nosniff";
            headers["X-Frame-Options"] = "DENY";
            headers["Referrer-Policy"] = "no-referrer";
            headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";
            headers["Cross-Origin-Resource-Policy"] = "same-site";
            return next(context);
        });

        app.UseHttpsRedirection();
        app.UseRouting();
        app.UseCors(ServiceCollectionExtensions.CorsPolicy);
        app.UseRateLimiter();
        app.UseAuthentication();
        app.UseAuthorization();

        LogOperationalWarnings(app);
        return app;
    }

    private static void LogOperationalWarnings(WebApplication app)
    {
        var smtp = app.Services.GetRequiredService<IOptions<SmtpSettings>>().Value;
        if (!smtp.IsConfigured)
        {
            app.Logger.LogWarning(
                "SMTP no está configurado: registro, reenvío de confirmación y recuperación responderán 503 " +
                "hasta definir Smtp__Host y Smtp__From. La confirmación de correo NO se desactiva.");
        }

        if (!app.Environment.IsDevelopment() && string.IsNullOrWhiteSpace(app.Configuration["DataProtection:KeysPath"]))
        {
            app.Logger.LogWarning(
                "DataProtection:KeysPath no está definido: los enlaces de confirmación y recuperación dejarán de " +
                "ser válidos al reiniciar o escalar la API.");
        }
    }
}
