using LoanCalcRD.Domain.Loans;

namespace LoanCalcRD.Application.Loans;

public sealed record LoanSimulationDto(
    Guid Id,
    Guid UserId,
    string Name,
    LoanType LoanType,
    decimal Amount,
    decimal AnnualRate,
    int TermMonths,
    bool IsFavorite,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc);

public sealed record CreateLoanSimulationRequest(
    string Name,
    LoanType LoanType,
    decimal Amount,
    decimal AnnualRate,
    int TermMonths);

public sealed record RenameLoanSimulationRequest(string Name);

public sealed record SetFavoriteLoanSimulationRequest(bool IsFavorite);
