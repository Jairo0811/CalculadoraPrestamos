using System.Globalization;
using System.Net;
using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using LoanCalcRD.Api.Infrastructure;
using LoanCalcRD.Application.Loans;
using LoanCalcRD.Infrastructure;
using LoanCalcRD.Infrastructure.Identity;
using LoanCalcRD.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace LoanCalcRD.Api.Extensions;

public static class ServiceCollectionExtensions
{
    public const string CorsPolicy = "Frontend";

    public static WebApplicationBuilder AddLoanCalcServices(this WebApplicationBuilder builder)
    {
        var configuration = builder.Configuration;
        var services = builder.Services;

        services.TryAddSingleton(TimeProvider.System);
        services.AddProblemDetails();
        services.AddExceptionHandler<ValidationExceptionHandler>();
        services.AddHealthChecks().AddCheck<DatabaseHealthCheck>("postgresql", tags: ["ready"]);

        services.Configure<JwtSettings>(configuration.GetSection(JwtSettings.SectionName));
        services.Configure<SmtpSettings>(configuration.GetSection(SmtpSettings.SectionName));
        services.Configure<RateLimitSettings>(configuration.GetSection(RateLimitSettings.SectionName));
        var isDevelopment = builder.Environment.IsDevelopment();
        services.AddOptions<AuthSettings>()
            .Bind(configuration.GetSection(AuthSettings.SectionName))
            .Validate(s => Uri.TryCreate(s.FrontendAccountUrl, UriKind.Absolute, out var url) &&
                           (isDevelopment || url.Scheme == Uri.UriSchemeHttps),
                "Auth:FrontendAccountUrl debe ser una URL absoluta (HTTPS fuera de desarrollo).")
            .ValidateOnStart();

        var connectionString = configuration.GetConnectionString("LoanCalcDb")
            ?? throw new InvalidOperationException("La cadena de conexión 'LoanCalcDb' no está configurada.");
        services.AddInfrastructure(connectionString);

        services.AddScoped<LoanSimulationService>();
        services.AddScoped<JwtTokenService>();
        services.AddScoped<SessionService>();
        services.AddScoped<AccountEmailService>();
        services.AddSingleton<AccountEmailQueue>();
        services.AddSingleton<IAccountEmailSender, SmtpAccountEmailSender>();
        services.AddHostedService<AccountEmailDispatcher>();
        services.AddSingleton<SessionCleanupService>();
        services.AddHostedService(sp => sp.GetRequiredService<SessionCleanupService>());

        AddDataProtection(builder);
        AddIdentity(services, configuration);
        AddJwtAuthentication(services, configuration);
        AddRateLimiting(services);
        AddCorsAndProxies(services, configuration);
        return builder;
    }

    private static void AddDataProtection(WebApplicationBuilder builder)
    {
        // Los tokens de confirmación y recuperación de Identity dependen de estas claves.
        // En producción deben persistir y compartirse entre instancias (volumen o almacenamiento común).
        var dataProtection = builder.Services.AddDataProtection().SetApplicationName("LoanCalcRD");
        var keysPath = builder.Configuration["DataProtection:KeysPath"];
        if (!string.IsNullOrWhiteSpace(keysPath))
        {
            dataProtection.PersistKeysToFileSystem(new DirectoryInfo(keysPath));
        }
    }

    private static void AddIdentity(IServiceCollection services, IConfiguration configuration)
    {
        var lifespanHours = Math.Clamp(configuration.GetValue<int?>("Auth:EmailTokenLifespanHours") ?? 2, 1, 48);
        services.Configure<DataProtectionTokenProviderOptions>(options =>
            options.TokenLifespan = TimeSpan.FromHours(lifespanHours));

        services.AddIdentityCore<LoanCalcUser>(options =>
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
    }

    private static void AddJwtAuthentication(IServiceCollection services, IConfiguration configuration)
    {
        var jwt = configuration.GetSection(JwtSettings.SectionName).Get<JwtSettings>() ?? new JwtSettings();
        if (Encoding.UTF8.GetByteCount(jwt.SigningKey) < JwtTokenService.MinimumKeyBytes)
        {
            throw new InvalidOperationException(
                "Configura Jwt__SigningKey con al menos 32 bytes aleatorios; no se permiten claves predeterminadas.");
        }
        if (string.IsNullOrWhiteSpace(jwt.Issuer) || string.IsNullOrWhiteSpace(jwt.Audience))
        {
            throw new InvalidOperationException("Jwt:Issuer y Jwt:Audience son obligatorios.");
        }

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.MapInboundClaims = false;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = jwt.Issuer,
                    ValidateAudience = true,
                    ValidAudience = jwt.Audience,
                    ValidateLifetime = true,
                    RequireExpirationTime = true,
                    RequireSignedTokens = true,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SigningKey)),
                    ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
                    ClockSkew = TimeSpan.FromSeconds(30),
                    NameClaimType = ClaimTypes.NameIdentifier
                };
                options.Events = new JwtBearerEvents
                {
                    // Cada petición confirma que la sesión del token sigue activa: logout, cambio de
                    // contraseña, reutilización de refresh o eliminación del usuario invalidan el JWT al instante.
                    OnTokenValidated = async context =>
                    {
                        var principal = context.Principal;
                        if (!Guid.TryParse(principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var userId) ||
                            !Guid.TryParse(principal?.FindFirstValue("sid"), out var sessionId))
                        {
                            context.Fail("Sesión inválida.");
                            return;
                        }
                        var sessions = context.HttpContext.RequestServices.GetRequiredService<SessionService>();
                        if (!await sessions.IsActiveAsync(sessionId, userId, context.HttpContext.RequestAborted))
                        {
                            context.Fail("Sesión revocada o expirada.");
                        }
                    }
                };
            });
        services.AddAuthorization();
    }

    private static void AddRateLimiting(IServiceCollection services)
    {
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = async (context, cancellationToken) =>
            {
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                {
                    context.HttpContext.Response.Headers.RetryAfter =
                        Math.Ceiling(retryAfter.TotalSeconds).ToString(CultureInfo.InvariantCulture);
                }
                await ApiProblems.Create(StatusCodes.Status429TooManyRequests, "too_many_requests",
                        "Demasiados intentos. Espera un momento antes de volver a intentarlo.")
                    .ExecuteAsync(context.HttpContext);
            };

            AddFixedWindow(options, RateLimitPolicies.Login, s => s.Login);
            AddFixedWindow(options, RateLimitPolicies.Registration, s => s.Registration);
            AddFixedWindow(options, RateLimitPolicies.Verification, s => s.Verification);
            AddFixedWindow(options, RateLimitPolicies.Recovery, s => s.Recovery);
            AddFixedWindow(options, RateLimitPolicies.Session, s => s.Session);
            AddFixedWindow(options, RateLimitPolicies.Api, s => s.Api);
        });
    }

    private static void AddFixedWindow(RateLimiterOptions options, string policy, Func<RateLimitSettings, RateLimitRule> select)
    {
        // Las opciones se leen en tiempo de petición: permiten ajustar límites por entorno y en pruebas.
        options.AddPolicy(policy, context =>
        {
            var rule = select(context.RequestServices.GetRequiredService<IOptionsMonitor<RateLimitSettings>>().CurrentValue);
            var client = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            return RateLimitPartition.GetFixedWindowLimiter($"{policy}:{client}", _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = Math.Max(1, rule.PermitLimit),
                Window = TimeSpan.FromSeconds(Math.Max(1, rule.WindowSeconds)),
                AutoReplenishment = true,
                QueueLimit = 0
            });
        });
    }

    private static void AddCorsAndProxies(IServiceCollection services, IConfiguration configuration)
    {
        var allowedOrigins = (configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
            .Where(o => !string.IsNullOrWhiteSpace(o))
            .Select(o => o.TrimEnd('/'))
            .ToArray();

        services.AddCors(options => options.AddPolicy(CorsPolicy, policy =>
        {
            if (allowedOrigins.Length == 0) return;
            policy.WithOrigins(allowedOrigins)
                .WithHeaders("Content-Type", "Authorization", CsrfProtection.HeaderName)
                .WithMethods("GET", "POST", "PATCH", "DELETE")
                .AllowCredentials()
                .SetPreflightMaxAge(TimeSpan.FromMinutes(10));
        }));

        // Solo se confía en X-Forwarded-* de proxies conocidos; de lo contrario cualquier cliente
        // podría falsear su IP y evadir la limitación de solicitudes.
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.ForwardLimit = 1;
            foreach (var proxy in configuration.GetSection("ForwardedHeaders:KnownProxies").Get<string[]>() ?? [])
            {
                if (IPAddress.TryParse(proxy, out var address)) options.KnownProxies.Add(address);
            }
#pragma warning disable CS0618, ASPDEPR005 // Compatibilidad con la API de redes conocidas.
            foreach (var network in configuration.GetSection("ForwardedHeaders:KnownNetworks").Get<string[]>() ?? [])
            {
                if (System.Net.IPNetwork.TryParse(network, out var parsed))
                {
                    options.KnownNetworks.Add(new Microsoft.AspNetCore.HttpOverrides.IPNetwork(parsed.BaseAddress, parsed.PrefixLength));
                }
            }
#pragma warning restore CS0618, ASPDEPR005
        });
    }
}

public static class RateLimitPolicies
{
    public const string Login = "login";
    public const string Registration = "registration";
    public const string Verification = "verification";
    public const string Recovery = "recovery";
    public const string Session = "session";
    public const string Api = "api";
}
