using System.Collections.Concurrent;
using LoanCalcRD.Api.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace LoanCalcRD.Tests;

public sealed class CapturedAccountEmailSender : IAccountEmailSender
{
    private readonly ConcurrentDictionary<string, string> bodies = new();
    public bool IsConfigured => true;
    public Task SendAsync(string recipient, string subject, string body, CancellationToken cancellationToken)
    {
        bodies[recipient] = body;
        return Task.CompletedTask;
    }

    public string GetLastLink(string recipient)
    {
        if (!bodies.TryGetValue(recipient, out var body))
            throw new InvalidOperationException("No se recibió un correo de prueba.");
        return body.Split('\n').Last().Trim();
    }
}

public sealed class AuthTestFactory : WebApplicationFactory<Program>
{
    public CapturedAccountEmailSender Emails { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IAccountEmailSender>();
            services.AddSingleton<IAccountEmailSender>(Emails);
        });
    }
}
