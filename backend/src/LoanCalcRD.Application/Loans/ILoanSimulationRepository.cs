using LoanCalcRD.Domain.Loans;

namespace LoanCalcRD.Application.Loans;

public interface ILoanSimulationRepository
{
    Task<IReadOnlyList<LoanSimulation>> GetByUserAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<LoanSimulation?> GetByIdAsync(Guid id, Guid userId, CancellationToken cancellationToken = default);
    Task AddAsync(LoanSimulation simulation, CancellationToken cancellationToken = default);
    void Remove(LoanSimulation simulation);
    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
