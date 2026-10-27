using LoanCalcRD.Application.Loans;
using LoanCalcRD.Domain.Loans;
using Microsoft.EntityFrameworkCore;

namespace LoanCalcRD.Infrastructure.Persistence;

public sealed class LoanSimulationRepository(LoanCalcDbContext dbContext) : ILoanSimulationRepository
{
    public async Task<IReadOnlyList<LoanSimulation>> GetByUserAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        return await dbContext.LoanSimulations
            .AsNoTracking()
            .Where(x => x.UserId == userId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);
    }

    public Task<LoanSimulation?> GetByIdAsync(
        Guid id,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        return dbContext.LoanSimulations
            .FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId, cancellationToken);
    }

    public async Task AddAsync(
        LoanSimulation simulation,
        CancellationToken cancellationToken = default)
    {
        await dbContext.LoanSimulations.AddAsync(simulation, cancellationToken);
    }

    public void Remove(LoanSimulation simulation)
    {
        dbContext.LoanSimulations.Remove(simulation);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        return dbContext.SaveChangesAsync(cancellationToken);
    }
}
