using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using LoanCalcRD.Infrastructure.Identity;
using Microsoft.IdentityModel.Tokens;

namespace LoanCalcRD.Api.Infrastructure;

public sealed record AccessTokenResponse(string AccessToken, string TokenType, DateTimeOffset ExpiresAtUtc);

public sealed class JwtTokenService(IConfiguration configuration)
{
    public AccessTokenResponse CreateAccessToken(LoanCalcUser user)
    {
        var key = configuration["Jwt:SigningKey"] ?? string.Empty;
        if (Encoding.UTF8.GetByteCount(key) < 32)
        {
            throw new InvalidOperationException("Configura Jwt__SigningKey con al menos 32 bytes aleatorios.");
        }

        var expires = DateTimeOffset.UtcNow.AddMinutes(15);
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            new Claim("token_version", "1")
        };
        var jwt = new JwtSecurityToken(
            issuer: configuration["Jwt:Issuer"],
            audience: configuration["Jwt:Audience"],
            claims: claims,
            notBefore: DateTime.UtcNow,
            expires: expires.UtcDateTime,
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
                SecurityAlgorithms.HmacSha256));

        return new AccessTokenResponse(
            new JwtSecurityTokenHandler().WriteToken(jwt),
            "Bearer",
            expires);
    }
}
