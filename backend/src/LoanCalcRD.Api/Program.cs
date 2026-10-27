using System.Net.Mail;
using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using LoanCalcRD.Api.Infrastructure;
using LoanCalcRD.Application.Loans;
using LoanCalcRD.Infrastructure;
using LoanCalcRD.Infrastructure.Identity;
using LoanCalcRD.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHealthChecks();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ValidationExceptionHandler>();
builder.Services.AddScoped<LoanSimulationService>();
builder.Services.AddScoped<JwtTokenService>();

var connectionString = builder.Configuration.GetConnectionString("LoanCalcDb")
    ?? throw new InvalidOperationException("La cadena de conexión 'LoanCalcDb' no está configurada.");

builder.Services.AddInfrastructure(connectionString);
builder.Services.AddIdentityCore<LoanCalcUser>(options =>
    {
        options.User.RequireUniqueEmail = true;
        options.Password.RequiredLength = 12;
        options.Password.RequireDigit = true;
        options.Password.RequireNonAlphanumeric = true;
        options.Password.RequireUppercase = true;
        options.Password.RequireLowercase = true;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.AllowedForNewUsers = true;
        // Email confirmation requires a configured mail delivery provider (Phase 6 follow-up).
        options.SignIn.RequireConfirmedEmail = false;
    })
    .AddEntityFrameworkStores<LoanCalcDbContext>()
    .AddSignInManager();

var jwtKey = builder.Configuration["Jwt:SigningKey"] ?? string.Empty;
if (Encoding.UTF8.GetByteCount(jwtKey) < 32)
{
    throw new InvalidOperationException("Configura Jwt__SigningKey con al menos 32 bytes aleatorios; no se permiten claves predeterminadas.");
}

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"],
            ValidateLifetime = true,
            RequireExpirationTime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = ClaimTypes.NameIdentifier
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 10,
            Window = TimeSpan.FromMinutes(1),
            AutoReplenishment = true,
            QueueLimit = 0
        }));
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
        if (allowedOrigins.Length > 0)
        {
            policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod();
        }
    });
});

var app = builder.Build();

app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseRouting();
app.UseCors("Frontend");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

var auth = app.MapGroup("/api/v1/auth").WithTags("Authentication");

auth.MapPost("/register", async (RegisterAccountRequest request, UserManager<LoanCalcUser> users) =>
{
    var email = request.Email?.Trim() ?? string.Empty;
    if (email.Length > 256 || !MailAddress.TryCreate(email, out var parsed) || parsed.Address != email)
    {
        return Results.BadRequest(new { message = "Introduce un correo electrónico válido." });
    }

    var user = new LoanCalcUser { Id = Guid.NewGuid(), UserName = email, Email = email };
    var result = await users.CreateAsync(user, request.Password ?? string.Empty);
    if (!result.Succeeded)
    {
        return Results.BadRequest(new
        {
            message = "No se pudo crear la cuenta.",
            errors = result.Errors.Select(error => error.Description).ToArray()
        });
    }

    return Results.Created($"/api/v1/auth/me", new { user.Id, user.Email });
}).RequireRateLimiting("auth");

auth.MapPost("/login", async (
    LoginAccountRequest request,
    UserManager<LoanCalcUser> users,
    SignInManager<LoanCalcUser> signIn,
    JwtTokenService tokens) =>
{
    var user = await users.FindByEmailAsync(request.Email?.Trim() ?? string.Empty);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    var result = await signIn.CheckPasswordSignInAsync(user, request.Password ?? string.Empty, lockoutOnFailure: true);
    if (!result.Succeeded)
    {
        return Results.Unauthorized();
    }

    return Results.Ok(tokens.CreateAccessToken(user));
}).RequireRateLimiting("auth");

auth.MapGet("/me", async (HttpContext context, UserManager<LoanCalcUser> users) =>
{
    if (!TryGetUserId(context.User, out var id)) return Results.Unauthorized();
    var user = await users.FindByIdAsync(id.ToString());
    return user is null ? Results.Unauthorized() : Results.Ok(new { user.Id, user.Email });
}).RequireAuthorization();

var simulations = app.MapGroup("/api/v1/simulations")
    .WithTags("Loan Simulations")
    .RequireAuthorization();

simulations.MapGet("/", async (HttpContext context, LoanSimulationService service, CancellationToken cancellationToken) =>
{
    if (!TryGetUserId(context.User, out var id)) return Results.Unauthorized();
    return Results.Ok(await service.GetByUserAsync(id, cancellationToken));
});
simulations.MapGet("/{id:guid}", async (HttpContext context, Guid id, LoanSimulationService service, CancellationToken cancellationToken) =>
{
    if (!TryGetUserId(context.User, out var userId)) return Results.Unauthorized();
    var item = await service.GetByIdAsync(id, userId, cancellationToken);
    return item is null ? Results.NotFound() : Results.Ok(item);
});
simulations.MapPost("/", async (HttpContext context, CreateLoanSimulationRequest request, LoanSimulationService service, CancellationToken cancellationToken) =>
{
    if (!TryGetUserId(context.User, out var userId)) return Results.Unauthorized();
    var created = await service.CreateAsync(userId, request, DateTimeOffset.UtcNow, cancellationToken);
    return Results.Created($"/api/v1/simulations/{created.Id}", created);
});
simulations.MapPatch("/{id:guid}/name", async (HttpContext context, Guid id, RenameLoanSimulationRequest request, LoanSimulationService service, CancellationToken cancellationToken) =>
{
    if (!TryGetUserId(context.User, out var userId)) return Results.Unauthorized();
    var updated = await service.RenameAsync(id, userId, request, DateTimeOffset.UtcNow, cancellationToken);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});
simulations.MapPatch("/{id:guid}/favorite", async (HttpContext context, Guid id, SetFavoriteLoanSimulationRequest request, LoanSimulationService service, CancellationToken cancellationToken) =>
{
    if (!TryGetUserId(context.User, out var userId)) return Results.Unauthorized();
    var updated = await service.SetFavoriteAsync(id, userId, request, DateTimeOffset.UtcNow, cancellationToken);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});
simulations.MapDelete("/{id:guid}", async (HttpContext context, Guid id, LoanSimulationService service, CancellationToken cancellationToken) =>
{
    if (!TryGetUserId(context.User, out var userId)) return Results.Unauthorized();
    return await service.DeleteAsync(id, userId, cancellationToken)
        ? Results.NoContent()
        : Results.NotFound();
});

app.MapHealthChecks("/health");
app.MapGet("/api/v1/system/database", async (LoanCalcDbContext dbContext, CancellationToken cancellationToken) =>
{
    var canConnect = await dbContext.Database.CanConnectAsync(cancellationToken);
    return canConnect
        ? Results.Ok(new { database = "available" })
        : Results.Problem("No fue posible conectar con PostgreSQL.");
}).WithName("DatabaseHealth");

app.Run();

static bool TryGetUserId(ClaimsPrincipal principal, out Guid id) =>
    Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out id) && id != Guid.Empty;

public sealed record RegisterAccountRequest(string Email, string Password);
public sealed record LoginAccountRequest(string Email, string Password);

public partial class Program { }
