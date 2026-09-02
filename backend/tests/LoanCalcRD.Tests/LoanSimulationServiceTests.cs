using LoanCalcRD.Application.Loans;
using LoanCalcRD.Domain.Loans;

namespace LoanCalcRD.Tests;

public sealed class LoanSimulationServiceTests
{
    [Fact]
    public async Task CreateAsync_PersistsAndReturnsSimulation()
    {
        var repository = new FakeLoanSimulationRepository();
        var service = new LoanSimulationService(repository);
        var userId = Guid.NewGuid();
        var now = DateTimeOffset.Parse("2026-09-02T19:30:00Z");

        var created = await service.CreateAsync(
            userId,
            new CreateLoanSimulationRequest("Vehículo", LoanType.Vehiculo, 850000m, 14.5m, 60),
            now);

        Assert.NotEqual(Guid.Empty, created.Id);
        Assert.Equal(userId, created.UserId);
        Assert.Equal("Vehículo", created.Name);
        Assert.Equal(850000m, created.Amount);
        Assert.Single(repository.Items);
        Assert.Equal(1, repository.SaveChangesCalls);
    }

    [Fact]
    public async Task RenameAsync_ChangesNameAndUpdateTimestamp()
    {
        var repository = SeededRepository(out var simulation);
        var service = new LoanSimulationService(repository);
        var updatedAt = DateTimeOffset.Parse("2026-09-02T20:00:00Z");

        var updated = await service.RenameAsync(
            simulation.Id,
            simulation.UserId,
            new RenameLoanSimulationRequest("Escenario refinanciado"),
            updatedAt);

        Assert.NotNull(updated);
        Assert.Equal("Escenario refinanciado", updated.Name);
        Assert.Equal(updatedAt, updated.UpdatedAtUtc);
    }

    [Fact]
    public async Task SetFavoriteAsync_UpdatesFavoriteState()
    {
        var repository = SeededRepository(out var simulation);
        var service = new LoanSimulationService(repository);

        var updated = await service.SetFavoriteAsync(
            simulation.Id,
            simulation.UserId,
            new SetFavoriteLoanSimulationRequest(true),
            DateTimeOffset.UtcNow);

        Assert.NotNull(updated);
        Assert.True(updated.IsFavorite);
    }

    [Fact]
    public async Task DeleteAsync_RemovesOwnedSimulation()
    {
        var repository = SeededRepository(out var simulation);
        var service = new LoanSimulationService(repository);

        var deleted = await service.DeleteAsync(simulation.Id, simulation.UserId);

        Assert.True(deleted);
        Assert.Empty(repository.Items);
    }

    [Fact]
    public async Task GetByIdAsync_DoesNotReturnAnotherUsersSimulation()
    {
        var repository = SeededRepository(out var simulation);
        var service = new LoanSimulationService(repository);

        var result = await service.GetByIdAsync(simulation.Id, Guid.NewGuid());

        Assert.Null(result);
    }

    private static FakeLoanSimulationRepository SeededRepository(out LoanSimulation simulation)
    {
        simulation = new LoanSimulation(
            Guid.NewGuid(),
            Guid.NewGuid(),
            "Préstamo personal",
            LoanType.Personal,
            250000m,
            18m,
            36,
            DateTimeOffset.Parse("2026-09-02T19:00:00Z"));

        return new FakeLoanSimulationRepository(simulation);
    }

    private sealed class FakeLoanSimulationRepository(params LoanSimulation[] initial) : ILoanSimulationRepository
    {
        public List<LoanSimulation> Items { get; } = [.. initial];
        public int SaveChangesCalls { get; private set; }

        public Task<IReadOnlyList<LoanSimulation>> GetByUserAsync(Guid userId, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<LoanSimulation>>(Items.Where(x => x.UserId == userId).ToList());

        public Task<LoanSimulation?> GetByIdAsync(Guid id, Guid userId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Items.SingleOrDefault(x => x.Id == id && x.UserId == userId));

        public Task AddAsync(LoanSimulation simulation, CancellationToken cancellationToken = default)
        {
            Items.Add(simulation);
            return Task.CompletedTask;
        }

        public void Remove(LoanSimulation simulation) => Items.Remove(simulation);

        public Task SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            SaveChangesCalls++;
            return Task.CompletedTask;
        }
    }
}
