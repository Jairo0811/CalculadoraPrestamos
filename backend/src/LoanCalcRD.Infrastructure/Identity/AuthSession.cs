namespace LoanCalcRD.Infrastructure.Identity;

// Una sesión por dispositivo. Revocar esta fila invalida también sus JWT en la siguiente petición.
public sealed class AuthSession
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset ExpiresAtUtc { get; set; }
    public DateTimeOffset? RevokedAtUtc { get; set; }
}
