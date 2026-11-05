using LoanCalcRD.Domain.Loans;
using LoanCalcRD.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace LoanCalcRD.Infrastructure.Persistence;

public sealed class LoanCalcDbContext(DbContextOptions<LoanCalcDbContext> options)
    : IdentityUserContext<LoanCalcUser, Guid>(options)
{
    public DbSet<LoanSimulation> LoanSimulations => Set<LoanSimulation>();
    public DbSet<AuthSession> AuthSessions => Set<AuthSession>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

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

        modelBuilder.Entity<AuthSession>(entity =>
        {
            entity.ToTable("auth_sessions");
            entity.HasKey(x => x.Id);
            entity.HasOne<LoanCalcUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(x => new { x.UserId, x.ExpiresAtUtc });
        });

        modelBuilder.Entity<RefreshToken>(entity =>
        {
            entity.ToTable("auth_refresh_tokens");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.TokenHash).HasMaxLength(64).IsRequired();
            entity.HasIndex(x => x.TokenHash).IsUnique();
            entity.HasOne<AuthSession>().WithMany().HasForeignKey(x => x.SessionId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
