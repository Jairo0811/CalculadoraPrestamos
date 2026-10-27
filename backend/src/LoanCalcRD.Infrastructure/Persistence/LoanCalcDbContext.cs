using LoanCalcRD.Domain.Loans;
using Microsoft.EntityFrameworkCore;

namespace LoanCalcRD.Infrastructure.Persistence;

public sealed class LoanCalcDbContext(DbContextOptions<LoanCalcDbContext> options) : DbContext(options)
{
    public DbSet<LoanSimulation> LoanSimulations => Set<LoanSimulation>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        var simulation = modelBuilder.Entity<LoanSimulation>();
        simulation.ToTable("loan_simulations");
        simulation.HasKey(x => x.Id);
        simulation.Property(x => x.Name).HasMaxLength(120).IsRequired();
        simulation.Property(x => x.Amount).HasPrecision(18, 2);
        simulation.Property(x => x.AnnualRate).HasPrecision(8, 4);
        simulation.Property(x => x.LoanType).HasConversion<string>().HasMaxLength(30);
        simulation.HasIndex(x => new { x.UserId, x.CreatedAtUtc });
        simulation.HasIndex(x => new { x.UserId, x.IsFavorite });
    }
}
