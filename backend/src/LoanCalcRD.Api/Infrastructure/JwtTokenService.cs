using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using LoanCalcRD.Infrastructure.Identity;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace LoanCalcRD.Api.Infrastructure;

public sealed record AccessTokenResponse(string AccessToken, string TokenType, DateTimeOffset ExpiresAtUtc);

public sealed class JwtTokenService(IOptions<JwtSettings> options, TimeProvider time)
{
    public const int MinimumKeyBytes = 32;

    public AccessTokenResponse CreateAccessToken(LoanCalcUser user, Guid sessionId)
    {
        var settings = options.Value;
        if (Encoding.UTF8.GetByteCount(settings.SigningKey) < MinimumKeyBytes)
        {
            throw new InvalidOperationException("Configura Jwt__SigningKey con al menos 32 bytes aleatorios.");
        }

        var now = time.GetUtcNow();
        // Tokens de acceso de corta duración: entre 5 y 30 minutos.
        var expires = now.AddMinutes(Math.Clamp(settings.AccessTokenMinutes, 5, 30));
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            new Claim("sid", sessionId.ToString())
        };
        var jwt = new JwtSecurityToken(
            issuer: settings.Issuer,
            audience: settings.Audience,
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: expires.UtcDateTime,
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(settings.SigningKey)),
                SecurityAlgorithms.HmacSha256));

        return new AccessTokenResponse(new JwtSecurityTokenHandler().WriteToken(jwt), "Bearer", expires);
    }
}
