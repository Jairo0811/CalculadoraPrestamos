using LoanCalcRD.Api.Endpoints;
using LoanCalcRD.Api.Extensions;

var builder = WebApplication.CreateBuilder(args);
builder.AddLoanCalcServices();

var app = builder.Build();
app.UseLoanCalcPipeline();

app.MapAuthEndpoints();
app.MapSimulationEndpoints();
app.MapSystemEndpoints();

app.Run();

public partial class Program { }
