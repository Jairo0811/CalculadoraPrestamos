using LoanCalcRD.Application.Loans;
using LoanCalcRD.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace LoanCalcRD.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        string connectionString)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionString);

        services.AddDbContext<LoanCalcDbContext>(options =>
            options.UseNpgsql(connectionString));

        services.AddScoped<ILoanSimulationRepository, LoanSimulationRepository>();

        return services;
    }
}
