using System.Net.Mail;
using LoanCalcRD.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;

namespace LoanCalcRD.Api.Endpoints;

public sealed record RegisterAccountRequest(string? Email, string? Password);
public sealed record LoginAccountRequest(string? Email, string? Password);
public sealed record ConfirmEmailRequest(Guid UserId, string? Token);
public sealed record EmailAccountRequest(string? Email);
public sealed record ResetPasswordRequest(Guid UserId, string? Token, string? NewPassword);
public sealed record ChangePasswordRequest(string? CurrentPassword, string? NewPassword);
public sealed record AccountProfileResponse(Guid Id, string Email, bool EmailConfirmed);
public sealed record MessageResponse(string Message);

internal static class AccountInput
{
    public const int MaxEmailLength = 254;
    // Límite superior para evitar hashing costoso con cargas enormes.
    public const int MaxPasswordLength = 128;

    public static bool TryNormalizeEmail(string? value, out string email)
    {
        email = value?.Trim() ?? string.Empty;
        if (email.Length is 0 or > MaxEmailLength) return false;
        return MailAddress.TryCreate(email, out var parsed) &&
               string.Equals(parsed.Address, email, StringComparison.Ordinal) &&
               email.IndexOf('@') > 0 && email.LastIndexOf('.') > email.IndexOf('@');
    }

    public static async Task<string[]> ValidatePasswordAsync(
        UserManager<LoanCalcUser> users, LoanCalcUser user, string? password)
    {
        if (string.IsNullOrEmpty(password)) return ["La contraseña es obligatoria."];
        if (password.Length > MaxPasswordLength) return [$"La contraseña no puede superar {MaxPasswordLength} caracteres."];

        var errors = new List<string>();
        foreach (var validator in users.PasswordValidators)
        {
            var result = await validator.ValidateAsync(users, user, password);
            if (!result.Succeeded) errors.AddRange(result.Errors.Select(Translate));
        }
        return errors.Distinct().ToArray();
    }

    public static string Translate(IdentityError error) => error.Code switch
    {
        nameof(IdentityErrorDescriber.PasswordTooShort) => "Debe tener al menos 12 caracteres.",
        nameof(IdentityErrorDescriber.PasswordRequiresDigit) => "Debe incluir al menos un número.",
        nameof(IdentityErrorDescriber.PasswordRequiresLower) => "Debe incluir al menos una letra minúscula.",
        nameof(IdentityErrorDescriber.PasswordRequiresUpper) => "Debe incluir al menos una letra mayúscula.",
        nameof(IdentityErrorDescriber.PasswordRequiresNonAlphanumeric) => "Debe incluir al menos un símbolo.",
        nameof(IdentityErrorDescriber.PasswordRequiresUniqueChars) => "Debe incluir más caracteres distintos.",
        nameof(IdentityErrorDescriber.PasswordMismatch) => "La contraseña actual no es correcta.",
        _ => "La contraseña no cumple la política de seguridad."
    };
}
