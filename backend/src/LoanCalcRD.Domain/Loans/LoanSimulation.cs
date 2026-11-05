namespace LoanCalcRD.Domain.Loans;

public sealed class LoanSimulation
{
    public const int MaxNameLength = 120;
    public const decimal MaxAmount = 1_000_000_000m;
    public const decimal MaxAnnualRate = 100m;
    public const int MaxTermMonths = 600;

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
        if (!Enum.IsDefined(loanType)) throw new ArgumentException("El tipo de préstamo no es válido.", nameof(loanType));
        if (amount <= 0 || amount > MaxAmount)
            throw new ArgumentOutOfRangeException(nameof(amount), "El monto debe ser mayor que cero y no superar RD$1,000,000,000.");
        if (annualRate < 0 || annualRate > MaxAnnualRate)
            throw new ArgumentOutOfRangeException(nameof(annualRate), "La tasa anual debe estar entre 0 % y 100 %.");
        if (termMonths <= 0 || termMonths > MaxTermMonths)
            throw new ArgumentOutOfRangeException(nameof(termMonths), "El plazo debe estar entre 1 y 600 meses.");

        Id = id;
        UserId = userId;
        Name = NormalizeName(name);
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
        Name = NormalizeName(name);
        UpdatedAtUtc = updatedAtUtc;
    }

    public void SetFavorite(bool isFavorite, DateTimeOffset updatedAtUtc)
    {
        IsFavorite = isFavorite;
        UpdatedAtUtc = updatedAtUtc;
    }

    private static string NormalizeName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("El nombre es obligatorio.", nameof(name));
        var trimmed = name.Trim();
        if (trimmed.Length > MaxNameLength)
            throw new ArgumentException($"El nombre no puede superar {MaxNameLength} caracteres.", nameof(name));
        return trimmed;
    }
}
