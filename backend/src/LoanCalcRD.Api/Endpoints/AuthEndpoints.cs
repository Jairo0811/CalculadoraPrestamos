using System.Security.Claims;
using LoanCalcRD.Api.Extensions;
using LoanCalcRD.Api.Infrastructure;
using LoanCalcRD.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;

namespace LoanCalcRD.Api.Endpoints;

public static class AuthEndpoints
{
    private const string GenericAccepted = "Si los datos son correctos, recibirás un correo con las instrucciones.";

    // Hash ficticio para igualar el tiempo de respuesta cuando el correo no existe.
    private static readonly Lazy<string> DummyPasswordHash = new(() =>
        new PasswordHasher<LoanCalcUser>().HashPassword(new LoanCalcUser(), Guid.NewGuid().ToString("N") + "Aa1!"));

    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var auth = app.MapGroup("/api/v1/auth")
            .WithTags("Authentication")
            .AddEndpointFilter(async (context, next) =>
            {
                context.HttpContext.Response.Headers.CacheControl = "no-store";
                return await next(context);
            });

        auth.MapPost("/register", RegisterAsync).RequireRateLimiting(RateLimitPolicies.Registration);
        auth.MapPost("/confirm-email", ConfirmEmailAsync).RequireRateLimiting(RateLimitPolicies.Verification);
        auth.MapPost("/resend-confirmation", ResendConfirmationAsync).RequireRateLimiting(RateLimitPolicies.Recovery);
        auth.MapPost("/forgot-password", ForgotPasswordAsync).RequireRateLimiting(RateLimitPolicies.Recovery);
        auth.MapPost("/reset-password", ResetPasswordAsync).RequireRateLimiting(RateLimitPolicies.Recovery);
        auth.MapPost("/login", LoginAsync).RequireRateLimiting(RateLimitPolicies.Login);
        auth.MapPost("/refresh", RefreshAsync).RequireRateLimiting(RateLimitPolicies.Session);
        auth.MapPost("/logout", LogoutAsync).RequireRateLimiting(RateLimitPolicies.Session);
        auth.MapPost("/logout-all", LogoutAllAsync).RequireAuthorization().RequireRateLimiting(RateLimitPolicies.Session);
        auth.MapPost("/change-password", ChangePasswordAsync).RequireAuthorization().RequireRateLimiting(RateLimitPolicies.Recovery);
        auth.MapGet("/me", MeAsync).RequireAuthorization().RequireRateLimiting(RateLimitPolicies.Api);
        return app;
    }

    private static async Task<IResult> RegisterAsync(
        RegisterAccountRequest request, UserManager<LoanCalcUser> users, AccountEmailService emails)
    {
        if (!emails.IsConfigured) return ApiProblems.EmailUnavailable();
        if (!AccountInput.TryNormalizeEmail(request.Email, out var email))
            return ApiProblems.Validation("invalid_email", "Introduce un correo electrónico válido.", "email");

        // La contraseña se valida ANTES de consultar si el correo existe: la respuesta
        // es idéntica para correos nuevos y registrados (sin enumeración de usuarios).
        var candidate = new LoanCalcUser { Id = Guid.NewGuid(), UserName = email, Email = email };
        var passwordErrors = await AccountInput.ValidatePasswordAsync(users, candidate, request.Password);
        if (passwordErrors.Length > 0)
            return ApiProblems.Validation("weak_password", "La contraseña no cumple la política de seguridad.", "password", passwordErrors);

        var existing = await users.FindByEmailAsync(email);
        if (existing is not null)
        {
            users.PasswordHasher.HashPassword(candidate, request.Password!); // Igualar coste temporal.
            if (await users.IsEmailConfirmedAsync(existing)) emails.QueueExistingAccountNotice(existing);
            else await emails.QueueConfirmationAsync(existing);
            return Accepted();
        }

        var result = await users.CreateAsync(candidate, request.Password!);
        if (!result.Succeeded)
        {
            // Carrera con otro registro del mismo correo: misma respuesta neutra.
            if (result.Errors.Any(e => e.Code.StartsWith("Duplicate", StringComparison.Ordinal))) return Accepted();
            return ApiProblems.Validation("invalid_email", "No es posible registrar este correo electrónico.", "email");
        }

        await emails.QueueConfirmationAsync(candidate);
        return Accepted();
    }

    private static async Task<IResult> ConfirmEmailAsync(ConfirmEmailRequest request, UserManager<LoanCalcUser> users)
    {
        var token = AccountEmailService.Decode(request.Token);
        var user = request.UserId == Guid.Empty || token is null ? null : await users.FindByIdAsync(request.UserId.ToString());
        if (user is null || token is null) return ApiProblems.InvalidLink();
        if (await users.IsEmailConfirmedAsync(user))
            return Results.Ok(new MessageResponse("Tu correo ya estaba confirmado. Puedes iniciar sesión."));

        var result = await users.ConfirmEmailAsync(user, token);
        if (!result.Succeeded) return ApiProblems.InvalidLink();

        // Invalida cualquier otro enlace emitido con el sello anterior.
        await users.UpdateSecurityStampAsync(user);
        return Results.Ok(new MessageResponse("Correo confirmado correctamente. Ya puedes iniciar sesión."));
    }

    private static async Task<IResult> ResendConfirmationAsync(
        EmailAccountRequest request, UserManager<LoanCalcUser> users, AccountEmailService emails)
    {
        if (!emails.IsConfigured) return ApiProblems.EmailUnavailable();
        if (AccountInput.TryNormalizeEmail(request.Email, out var email))
        {
            var user = await users.FindByEmailAsync(email);
            if (user is not null && !await users.IsEmailConfirmedAsync(user)) await emails.QueueConfirmationAsync(user);
        }
        return Accepted();
    }

    private static async Task<IResult> ForgotPasswordAsync(
        EmailAccountRequest request, UserManager<LoanCalcUser> users, AccountEmailService emails)
    {
        if (!emails.IsConfigured) return ApiProblems.EmailUnavailable();
        if (AccountInput.TryNormalizeEmail(request.Email, out var email))
        {
            var user = await users.FindByEmailAsync(email);
            if (user is not null)
            {
                if (await users.IsEmailConfirmedAsync(user)) await emails.QueuePasswordResetAsync(user);
                else await emails.QueueConfirmationAsync(user);
            }
        }
        return Accepted();
    }

    private static async Task<IResult> ResetPasswordAsync(
        ResetPasswordRequest request, UserManager<LoanCalcUser> users,
        SessionService sessions, AccountEmailService emails, CancellationToken cancellationToken)
    {
        var token = AccountEmailService.Decode(request.Token);
        var user = request.UserId == Guid.Empty || token is null ? null : await users.FindByIdAsync(request.UserId.ToString());
        if (user is null || token is null || !await users.IsEmailConfirmedAsync(user)) return ApiProblems.InvalidLink();

        var passwordErrors = await AccountInput.ValidatePasswordAsync(users, user, request.NewPassword);
        if (passwordErrors.Length > 0)
            return ApiProblems.Validation("weak_password", "La contraseña no cumple la política de seguridad.", "newPassword", passwordErrors);

        // ResetPasswordAsync actualiza el sello de seguridad: el enlace queda inutilizable tras su uso.
        var result = await users.ResetPasswordAsync(user, token, request.NewPassword!);
        if (!result.Succeeded) return ApiProblems.InvalidLink();

        await users.ResetAccessFailedCountAsync(user);
        await users.SetLockoutEndDateAsync(user, null);
        await sessions.RevokeAllAsync(user.Id, cancellationToken);
        emails.QueuePasswordChangedNotice(user);
        return Results.Ok(new MessageResponse("Contraseña actualizada. Inicia sesión con tu nueva contraseña."));
    }

    private static async Task<IResult> LoginAsync(
        LoginAccountRequest request, HttpContext http,
        UserManager<LoanCalcUser> users, SignInManager<LoanCalcUser> signIn, SessionService sessions)
    {
        var password = request.Password ?? string.Empty;
        if (!AccountInput.TryNormalizeEmail(request.Email, out var email) ||
            password.Length is 0 or > AccountInput.MaxPasswordLength)
        {
            return ApiProblems.InvalidCredentials();
        }

        var user = await users.FindByEmailAsync(email);
        if (user is null)
        {
            users.PasswordHasher.VerifyHashedPassword(new LoanCalcUser(), DummyPasswordHash.Value, password);
            return ApiProblems.InvalidCredentials();
        }

        var result = await signIn.CheckPasswordSignInAsync(user, password, lockoutOnFailure: true);
        if (result.Succeeded)
        {
            var issued = await sessions.CreateAsync(user, http.RequestAborted);
            SessionService.SetCookie(http, issued);
            return Results.Ok(issued.Access);
        }

        if (result.IsNotAllowed && !await users.IsLockedOutAsync(user))
        {
            // Identity rechaza cuentas sin confirmar antes de comprobar la contraseña. Solo revelamos
            // "pendiente de confirmar" a quien demuestra conocer la contraseña; el resto cuenta como fallo.
            if (await users.CheckPasswordAsync(user, password))
            {
                return ApiProblems.Create(StatusCodes.Status403Forbidden, "email_not_confirmed",
                    "Tu cuenta aún no está confirmada. Revisa tu correo o solicita un nuevo enlace.");
            }
            await users.AccessFailedAsync(user);
        }

        // Contraseña incorrecta o cuenta bloqueada temporalmente: misma respuesta genérica.
        return ApiProblems.InvalidCredentials();
    }

    private static async Task<IResult> RefreshAsync(HttpContext http, SessionService sessions)
    {
        if (!CsrfProtection.IsValid(http)) return ApiProblems.CsrfRejected();
        var issued = await sessions.RotateAsync(http.Request.Cookies[SessionService.CookieName], http.RequestAborted);
        if (issued is null)
        {
            SessionService.ClearCookie(http);
            return ApiProblems.SessionExpired();
        }
        SessionService.SetCookie(http, issued);
        return Results.Ok(issued.Access);
    }

    private static async Task<IResult> LogoutAsync(HttpContext http, SessionService sessions)
    {
        if (!CsrfProtection.IsValid(http)) return ApiProblems.CsrfRejected();
        await sessions.RevokeByRefreshAsync(http.Request.Cookies[SessionService.CookieName], http.RequestAborted);
        SessionService.ClearCookie(http);
        return Results.NoContent();
    }

    private static async Task<IResult> LogoutAllAsync(HttpContext http, SessionService sessions)
    {
        if (!CsrfProtection.IsValid(http)) return ApiProblems.CsrfRejected();
        if (!TryGetUserId(http.User, out var userId)) return ApiProblems.SessionExpired();
        await sessions.RevokeAllAsync(userId, http.RequestAborted);
        SessionService.ClearCookie(http);
        return Results.NoContent();
    }

    private static async Task<IResult> ChangePasswordAsync(
        ChangePasswordRequest request, HttpContext http, UserManager<LoanCalcUser> users,
        SessionService sessions, AccountEmailService emails)
    {
        if (!TryGetUserId(http.User, out var userId)) return ApiProblems.SessionExpired();
        var user = await users.FindByIdAsync(userId.ToString());
        if (user is null) return ApiProblems.SessionExpired();

        var current = request.CurrentPassword ?? string.Empty;
        if (current.Length is 0 or > AccountInput.MaxPasswordLength)
            return ApiProblems.Validation("invalid_current_password", "La contraseña actual no es correcta.", "currentPassword");

        var passwordErrors = await AccountInput.ValidatePasswordAsync(users, user, request.NewPassword);
        if (passwordErrors.Length > 0)
            return ApiProblems.Validation("weak_password", "La contraseña no cumple la política de seguridad.", "newPassword", passwordErrors);
        if (string.Equals(current, request.NewPassword, StringComparison.Ordinal))
            return ApiProblems.Validation("same_password", "La nueva contraseña debe ser distinta de la actual.", "newPassword");

        var result = await users.ChangePasswordAsync(user, current, request.NewPassword!);
        if (!result.Succeeded)
        {
            if (result.Errors.Any(e => e.Code == nameof(IdentityErrorDescriber.PasswordMismatch)))
            {
                await users.AccessFailedAsync(user);
                return ApiProblems.Validation("invalid_current_password", "La contraseña actual no es correcta.", "currentPassword");
            }
            return ApiProblems.Validation("weak_password", "La contraseña no cumple la política de seguridad.", "newPassword",
                result.Errors.Select(AccountInput.Translate).Distinct().ToArray());
        }

        // Se cierran todas las sesiones (incluida la actual) y se emite una nueva para este dispositivo.
        await sessions.RevokeAllAsync(user.Id, http.RequestAborted);
        var issued = await sessions.CreateAsync(user, http.RequestAborted);
        SessionService.SetCookie(http, issued);
        emails.QueuePasswordChangedNotice(user);
        return Results.Ok(issued.Access);
    }

    private static async Task<IResult> MeAsync(HttpContext http, UserManager<LoanCalcUser> users)
    {
        if (!TryGetUserId(http.User, out var userId)) return ApiProblems.SessionExpired();
        var user = await users.FindByIdAsync(userId.ToString());
        return user is null
            ? ApiProblems.SessionExpired()
            : Results.Ok(new AccountProfileResponse(user.Id, user.Email ?? string.Empty, user.EmailConfirmed));
    }

    private static IResult Accepted() => Results.Accepted(value: new MessageResponse(GenericAccepted));

    internal static bool TryGetUserId(ClaimsPrincipal principal, out Guid id) =>
        Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out id) && id != Guid.Empty;
}
