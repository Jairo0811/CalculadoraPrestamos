using LoanCalcRD.Domain.Loans;

namespace LoanCalcRD.Application.Loans;

public sealed class LoanSimulationService(ILoanSimulationRepository repository)
{
    public async Task<IReadOnlyList<LoanSimulationDto>> GetByUserAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        EnsureUserId(userId);

        var simulations = await repository.GetByUserAsync(userId, cancellationToken);
        return simulations.Select(Map).ToList();
    }

    public async Task<LoanSimulationDto?> GetByIdAsync(
        Guid id,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        EnsureUserId(userId);
        if (id == Guid.Empty) throw new ArgumentException("El identificador de la simulación es obligatorio.", nameof(id));

        var simulation = await repository.GetByIdAsync(id, userId, cancellationToken);
        return simulation is null ? null : Map(simulation);
    }

    public async Task<LoanSimulationDto> CreateAsync(
        Guid userId,
        CreateLoanSimulationRequest request,
        DateTimeOffset nowUtc,
        CancellationToken cancellationToken = default)
    {
        EnsureUserId(userId);
        ArgumentNullException.ThrowIfNull(request);

        var simulation = new LoanSimulation(
            Guid.NewGuid(),
            userId,
            request.Name,
            request.LoanType,
            request.Amount,
            request.AnnualRate,
            request.TermMonths,
            nowUtc);

        await repository.AddAsync(simulation, cancellationToken);
        await repository.SaveChangesAsync(cancellationToken);

        return Map(simulation);
    }

    public async Task<LoanSimulationDto?> RenameAsync(
        Guid id,
        Guid userId,
        RenameLoanSimulationRequest request,
        DateTimeOffset nowUtc,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        var simulation = await GetTrackedAsync(id, userId, cancellationToken);
        if (simulation is null) return null;

        simulation.Rename(request.Name, nowUtc);
        await repository.SaveChangesAsync(cancellationToken);
        return Map(simulation);
    }

    public async Task<LoanSimulationDto?> SetFavoriteAsync(
        Guid id,
        Guid userId,
        SetFavoriteLoanSimulationRequest request,
        DateTimeOffset nowUtc,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        var simulation = await GetTrackedAsync(id, userId, cancellationToken);
        if (simulation is null) return null;

        simulation.SetFavorite(request.IsFavorite, nowUtc);
        await repository.SaveChangesAsync(cancellationToken);
        return Map(simulation);
    }

    public async Task<bool> DeleteAsync(
        Guid id,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var simulation = await GetTrackedAsync(id, userId, cancellationToken);
        if (simulation is null) return false;

        repository.Remove(simulation);
        await repository.SaveChangesAsync(cancellationToken);
        return true;
    }

    private async Task<LoanSimulation?> GetTrackedAsync(
        Guid id,
        Guid userId,
        CancellationToken cancellationToken)
    {
        EnsureUserId(userId);
        if (id == Guid.Empty) throw new ArgumentException("El identificador de la simulación es obligatorio.", nameof(id));

        return await repository.GetByIdAsync(id, userId, cancellationToken);
    }

    private static void EnsureUserId(Guid userId)
    {
        if (userId == Guid.Empty)
        {
            throw new ArgumentException("El usuario es obligatorio.", nameof(userId));
        }
    }

    private static LoanSimulationDto Map(LoanSimulation simulation) => new(
        simulation.Id,
        simulation.UserId,
        simulation.Name,
        simulation.LoanType,
        simulation.Amount,
        simulation.AnnualRate,
        simulation.TermMonths,
        simulation.IsFavorite,
        simulation.CreatedAtUtc,
        simulation.UpdatedAtUtc);
}
