namespace LoanCalcRD.Domain.Loans;

public sealed class LoanSimulation
{
    private LoanSimulation()
    {
    }

    public LoanSimulation(
        Guid id,
        Guid userId,
        string name,
        LoanType loanType,
        decimal amount,
        decimal annualRate,
        int termMonths,
        DateTimeOffset createdAtUtc)
    {
        if (id == Guid.Empty) throw new ArgumentException("El identificador es obligatorio.", nameof(id));
        if (userId == Guid.Empty) throw new ArgumentException("El usuario es obligatorio.", nameof(userId));
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("El nombre es obligatorio.", nameof(name));
        if (amount <= 0) throw new ArgumentOutOfRangeException(nameof(amount));
        if (annualRate < 0) throw new ArgumentOutOfRangeException(nameof(annualRate));
        if (termMonths <= 0) throw new ArgumentOutOfRangeException(nameof(termMonths));

        Id = id;
        UserId = userId;
        Name = name.Trim();
        LoanType = loanType;
        Amount = amount;
        AnnualRate = annualRate;
        TermMonths = termMonths;
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = createdAtUtc;
    }

    public Guid Id { get; private set; }
    public Guid UserId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public LoanType LoanType { get; private set; }
    public decimal Amount { get; private set; }
    public decimal AnnualRate { get; private set; }
    public int TermMonths { get; private set; }
    public bool IsFavorite { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset UpdatedAtUtc { get; private set; }

    public void Rename(string name, DateTimeOffset updatedAtUtc)
    {
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("El nombre es obligatorio.", nameof(name));

        Name = name.Trim();
        UpdatedAtUtc = updatedAtUtc;
    }

    public void SetFavorite(bool isFavorite, DateTimeOffset updatedAtUtc)
    {
        IsFavorite = isFavorite;
        UpdatedAtUtc = updatedAtUtc;
    }
}
