using Microsoft.AspNetCore.Identity;

namespace LoanCalcRD.Infrastructure.Identity;

// Identity handles password hashing, lockout, normalized email, and security stamps.
public sealed class LoanCalcUser : IdentityUser<Guid>
{
}
