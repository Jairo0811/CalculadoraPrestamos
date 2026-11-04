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
builder.Services.AddScoped<SessionService>();
builder.Services.AddScoped<AccountEmailService>();
builder.Services.AddScoped<IAccountEmailSender, SmtpAccountEmailSender>();
builder.Services.Configure<DataProtectionTokenProviderOptions>(options =>
    options.TokenLifespan = TimeSpan.FromHours(2));

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
        options.SignIn.RequireConfirmedEmail = true;
    })
    .AddEntityFrameworkStores<LoanCalcDbContext>()
    .AddSignInManager()
    .AddDefaultTokenProviders();

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
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = async context =>
            {
                var claims = context.Principal;
                var userId = claims?.FindFirstValue(ClaimTypes.NameIdentifier);
                var sessionId = claims?.FindFirstValue("sid");
                if (!Guid.TryParse(userId, out var uid) || !Guid.TryParse(sessionId, out var sid))
                {
                    context.Fail("Sesión inválida.");
                    return;
                }
                var db = context.HttpContext.RequestServices.GetRequiredService<LoanCalcDbContext>();
                var now = DateTimeOffset.UtcNow;
                var active = await db.AuthSessions.AsNoTracking()
                    .AnyAsync(s => s.Id == sid && s.UserId == uid &&
                                   s.RevokedAtUtc == null && s.ExpiresAtUtc > now);
                if (!active) context.Fail("Sesión revocada o expirada.");
            }
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
    options.AddPolicy("verification", context => RateLimitPartition.GetFixedWindowLimiter(
        "verification:" + (context.Connection.RemoteIpAddress?.ToString() ?? "unknown"),
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 12,
            Window = TimeSpan.FromMinutes(1),
            AutoReplenishment = true,
            QueueLimit = 0
        }));
    options.AddPolicy("recovery", context => RateLimitPartition.GetFixedWindowLimiter(
        "recovery:" + (context.Connection.RemoteIpAddress?.ToString() ?? "unknown"),
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 6,
            Window = TimeSpan.FromMinutes(1),
            AutoReplenishment = true,
            QueueLimit = 0
        }));
    options.AddPolicy("session", context => RateLimitPartition.GetFixedWindowLimiter(
        "sessions:" + (context.Connection.RemoteIpAddress?.ToString() ?? "unknown"),
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 30,
            Window = TimeSpan.FromMinutes(1),
            AutoReplenishment = true,
            QueueLimit = 0
        }));
});

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        if (allowedOrigins.Length > 0)
        {
            policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials();
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

// The anti-CSRF header is intentionally non-simple. An untrusted origin cannot send it
// with cookies without passing the explicit-origin CORS preflight.
static bool ValidCsrf(HttpContext context) =>
    context.Request.Headers.TryGetValue("X-LoanCalc-CSRF", out var value) && value == "1";

var auth = app.MapGroup("/api/v1/auth").WithTags("Authentication");

auth.MapPost("/register", async (
    RegisterAccountRequest request, UserManager<LoanCalcUser> users,
    AccountEmailService emailService, HttpContext http) =>
{
    if (!emailService.IsConfigured) return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    var email = request.Email?.Trim() ?? string.Empty;
    if (email.Length > 256 || !MailAddress.TryCreate(email, out var parsed) || parsed.Address != email)
        return Results.BadRequest(new { message = "Introduce un correo electrónico válido." });

    if (await users.FindByEmailAsync(email) is not null)
        return Results.Accepted(value: new { message = "Si la cuenta puede registrarse, recibirás un correo de confirmación." });

    var user = new LoanCalcUser { Id = Guid.NewGuid(), UserName = email, Email = email };
    var result = await users.CreateAsync(user, request.Password ?? string.Empty);
    if (!result.Succeeded)
    {
        // No divulgamos si el correo ya existe en una operación concurrente.
        if (result.Errors.Any(x => x.Code.StartsWith("Duplicate", StringComparison.Ordinal)))
            return Results.Accepted(value: new { message = "Si la cuenta puede registrarse, recibirás un correo de confirmación." });
        return Results.BadRequest(new { message = "No se pudo crear la cuenta.",
            errors = result.Errors.Select(error => error.Description).ToArray() });
    }

    try { await emailService.SendConfirmationAsync(user, http.RequestAborted); }
    catch (Exception)
    {
        // Cuenta sin verificar; puede reenviarse la confirmación cuando SMTP esté disponible.
        return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    }
    return Results.Accepted(value: new { message = "Revisa tu correo para confirmar la cuenta." });
}).RequireRateLimiting("auth");

auth.MapPost("/confirm-email", async (ConfirmEmailRequest request, UserManager<LoanCalcUser> users) =>
{
    var user = await users.FindByIdAsync(request.UserId.ToString());
    var token = AccountEmailService.Decode(request.Token);
    if (user is null || token is null) return Results.BadRequest(new { message = "Enlace inválido o expirado." });
    var result = await users.ConfirmEmailAsync(user, token);
    return result.Succeeded ? Results.Ok(new { message = "Correo confirmado correctamente." })
        : Results.BadRequest(new { message = "Enlace inválido o expirado." });
}).RequireRateLimiting("verification");

auth.MapPost("/resend-confirmation", async (
    EmailAccountRequest request, UserManager<LoanCalcUser> users,
    AccountEmailService emailService, HttpContext http) =>
{
    if (!emailService.IsConfigured) return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    var user = await users.FindByEmailAsync(request.Email?.Trim() ?? string.Empty);
    if (user is not null && !await users.IsEmailConfirmedAsync(user))
    {
        try { await emailService.SendConfirmationAsync(user, http.RequestAborted); }
        catch (Exception) { return Results.StatusCode(StatusCodes.Status503ServiceUnavailable); }
    }
    return Results.Accepted(value: new { message = "Si la cuenta existe, recibirá instrucciones." });
}).RequireRateLimiting("recovery");

auth.MapPost("/forgot-password", async (
    EmailAccountRequest request, UserManager<LoanCalcUser> users,
    AccountEmailService emailService, HttpContext http) =>
{
    if (!emailService.IsConfigured) return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    var user = await users.FindByEmailAsync(request.Email?.Trim() ?? string.Empty);
    if (user is not null && await users.IsEmailConfirmedAsync(user))
    {
        try { await emailService.SendPasswordResetAsync(user, http.RequestAborted); }
        catch (Exception) { return Results.StatusCode(StatusCodes.Status503ServiceUnavailable); }
    }
    return Results.Accepted(value: new { message = "Si la cuenta existe, recibirá instrucciones." });
}).RequireRateLimiting("recovery");

auth.MapPost("/reset-password", async (
    ResetPasswordRequest request, UserManager<LoanCalcUser> users, SessionService sessions,
    CancellationToken cancellationToken) =>
{
    var user = await users.FindByEmailAsync(request.Email?.Trim() ?? string.Empty);
    var token = AccountEmailService.Decode(request.Token);
    if (user is null || token is null || !await users.IsEmailConfirmedAsync(user))
        return Results.BadRequest(new { message = "El enlace es inválido o ha expirado." });
    var result = await users.ResetPasswordAsync(user, token, request.NewPassword ?? string.Empty);
    if (!result.Succeeded)
        return Results.BadRequest(new { message = "El enlace o la contraseña no son válidos." });
    await sessions.RevokeAllAsync(user.Id, cancellationToken);
    return Results.Ok(new { message = "Contraseña actualizada. Inicia sesión nuevamente." });
}).RequireRateLimiting("recovery");

auth.MapPost("/login", async (
    LoginAccountRequest request, HttpContext http,
    UserManager<LoanCalcUser> users, SignInManager<LoanCalcUser> signIn,
    SessionService sessions) =>
{
    var user = await users.FindByEmailAsync(request.Email?.Trim() ?? string.Empty);
    if (user is null) return Results.Unauthorized();

    var result = await signIn.CheckPasswordSignInAsync(user, request.Password ?? string.Empty, lockoutOnFailure: true);
    if (!result.Succeeded) return Results.Unauthorized();

    var issued = await sessions.CreateAsync(user, http.RequestAborted);
    SessionService.SetCookie(http, issued);
    return Results.Ok(issued.Access);
}).RequireRateLimiting("auth");

auth.MapPost("/refresh", async (HttpContext http, SessionService sessions) =>
{
    if (!ValidCsrf(http)) return Results.BadRequest();
    var issued = await sessions.RotateAsync(http.Request.Cookies[SessionService.CookieName], http.RequestAborted);
    if (issued is null)
    {
        SessionService.ClearCookie(http);
        return Results.Unauthorized();
    }
    SessionService.SetCookie(http, issued);
    return Results.Ok(issued.Access);
}).RequireRateLimiting("session");

auth.MapPost("/logout", async (HttpContext http, SessionService sessions) =>
{
    if (!ValidCsrf(http)) return Results.BadRequest();
    await sessions.RevokeByRefreshAsync(http.Request.Cookies[SessionService.CookieName], http.RequestAborted);
    SessionService.ClearCookie(http);
    return Results.NoContent();
}).RequireRateLimiting("session");

auth.MapPost("/logout-all", async (HttpContext http, SessionService sessions) =>
{
    if (!ValidCsrf(http)) return Results.BadRequest();
    if (!Guid.TryParse(http.User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid)) return Results.Unauthorized();
    await sessions.RevokeAllAsync(uid, http.RequestAborted);
    SessionService.ClearCookie(http);
    return Results.NoContent();
}).RequireAuthorization().RequireRateLimiting("session");

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
public sealed record ConfirmEmailRequest(Guid UserId, string Token);
public sealed record EmailAccountRequest(string Email);
public sealed record ResetPasswordRequest(string Email, string Token, string NewPassword);

public partial class Program { }
