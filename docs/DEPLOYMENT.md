# Guía de despliegue y secretos — LoanCalc RD v3

- **Parte A:** Cloudflare Pages y despliegue continuo de Angular.
- **Parte B:** API, PostgreSQL, cuentas y SMTP (Fase 8; no publicados).

---

# Parte A — Cloudflare Pages

## A.1 Sitio y Git

- **URL de producción:** https://loancalcrd.pages.dev
- **Repositorio:** `Jairo0811/CalculadoraPrestamos`
- **Rama de producción deseada:** `master`.
- **Integración:** Cloudflare Pages → GitHub. Cloudflare controla los despliegues, GitHub Actions los verifica sin tokens de Cloudflare.
- **Preview branches:** configurable en Cloudflare → Workers & Pages → LoanCalc RD → Settings → Builds & deployments → Branch control.

Confirma en el panel que `master` está seleccionada y que los despliegues automáticos de producción están activos. La URL del usuario no prueba por sí sola esos ajustes. No actives cuentas: `environment.production.ts` mantiene `features.accounts = false`.

## A.2 Ajustes de compilación

| Campo | Valor |
|---|---|
| Framework | Angular |
| Directorio raíz | `calculadora-prestamos` |
| Comando | `npm ci && npm run build` |
| Output directory | `dist/calculadora-prestamos/browser` |
| Node.js | 22 (`NODE_VERSION=22`) |

El script `npm run build` ejecuta Angular y escribe `build-info.json` con `CF_PAGES_COMMIT_SHA` y `CF_PAGES_BRANCH` en Cloudflare. Estos metadatos son públicos y no incluyen secretos.

## A.3 SEO y vista previa en WhatsApp

- El HTML compilado contiene `og:title`, `og:description`, `og:url`, `og:image`, `twitter:card` y la URL canónica.
- La imagen absoluta es `https://loancalcrd.pages.dev/assets/img/logo-loancalc-rd-900.webp`. Debe responder sin autenticación y con contenido de imagen.
- Los robots sociales no ejecutan Angular: las etiquetas se generan desde `src/index.html` y CI las comprueba con `scripts/check-social-preview.mjs`.
- Prueba después de publicar pegando `https://loancalcrd.pages.dev/?v=1` en WhatsApp. Los clientes pueden almacenar caché y la previsualización exacta solo se confirma en WhatsApp.

## A.4 Enrutamiento y cabeceras

- `calculadora-prestamos/public/_redirects`: fallback SPA (`/* /index.html 200`) sin afectar activos existentes.
- `calculadora-prestamos/public/_headers`: HSTS, no-sniff, política de referer, caché para bundles con hash y `build-info.json` sin caché.
- Las cookies de autenticación y el proxy `/api/*` no deben habilitarse hasta la Fase 8.

## A.5 Verificación automática

- `LoanCalc RD CI`: `npm ci`, auditoría npm, pruebas Angular, build y pruebas de metadatos; E2E y smoke del build público.
- `LoanCalc RD Backend CI`: backend, EF migrations, xUnit y seguridad.
- `LoanCalc RD Cloudflare Verify`: tras push a `master`, espera que `https://loancalcrd.pages.dev/build-info.json` refleje el commit y prueba HTML, Open Graph e imagen pública.
- Si el verificador falla, comprobar el build en el panel de Cloudflare, la rama de producción y las reglas de dominio. **No confundir checks verdes de GitHub con un despliegue de Cloudflare confirmado.**

## A.6 Rollback

Desde Cloudflare Pages → Deployments, selecciona un despliegue estable y usa la opción de reversión o promoción que el panel habilite para ese proyecto. Para corregir permanentemente el código, crea `git revert <sha>` en una rama y fusiónalo con CI verde.

## A.7 Diagnóstico

| Problema | Verificación |
|---|---|
| El dominio no carga | Revisa el estado DNS, Pages Deployments y la URL del proyecto |
| `build-info.json` no coincide | Verifica `master` como rama de producción, auto deploy y que `CF_PAGES_COMMIT_SHA` esté disponible |
| WhatsApp no muestra miniatura | Abre `og:image` directamente; comprueba meta estático, respuesta 200, tamaño y caché |
| Refrescar `/calculator` da 404 | Comprueba que `_redirects` esté copiado por Angular a la salida |
| Cambios en PR no generan Preview | Revisa control de ramas y GitHub integration en Cloudflare |

---
# Parte B — API, base de datos y cuentas (Fase 8)

## B.1 Topología recomendada

```text
Navegador ──HTTPS──► loancalcrd.pages.dev (o dominio propio)
                     ├── /*        → Angular (estático)
                     └── /api/*    → proxy de mismo origen (Worker / API route) ──HTTPS──► API ASP.NET Core ──► PostgreSQL 17
```

**Evaluación:** el proxy de mismo origen `/api/*` es la estrategia adecuada para esta topología (frontend estático en Cloudflare Pages + API ASP.NET Core en otro proveedor): mantiene `SameSite=Strict`, evita CORS en el navegador y no depende de cookies de terceros. Inconvenientes asumidos: un salto de red adicional y que la IP del cliente llega en `X-Forwarded-For` (configura `ForwardedHeaders`). Por eso la regla queda **comentada**: no se activa hasta que exista una API real.

**Por qué un proxy de mismo origen:** el refresh token vive en una cookie `HttpOnly` con `SameSite=Strict`. Si Angular y la API están en sitios distintos (por ejemplo `*.pages.dev` y `*.onrender.com`), la cookie es de terceros: con `Strict` o `Lax` el navegador no la envía en `fetch`, y con `None` muchos navegadores la bloquean por la protección contra rastreo. Con el proxy, para el navegador todo es el mismo origen y `Strict` funciona.

Pasos:

1. Publica la API en HTTPS.
2. Configura un proxy de mismo origen `/api/*` en Cloudflare (por ejemplo, un Worker/Pages Function bien securizado) cuando exista la API. No lo actives antes de tener la API publicada. El archivo `_redirects` actual sirve solo la SPA.
3. Mantén `apiBaseUrl: '/api/v1'` en `environment.production.ts`.
4. Configura en la API `Cors__AllowedOrigins__0=https://loancalcrd.pages.dev` (para el `Origin` que reenvía el proxy) y `Auth__Cookie__SameSite=Strict`.
5. Cuando todo esté verificado, cambia `features.accounts` a `true` en `environment.production.ts`.

### Alternativa: dominios distintos

Solo si no es posible el proxy:

- `Auth__Cookie__SameSite=None` (la API fuerza `Secure`).
- `apiBaseUrl` absoluto en `environment.production.ts`.
- `Cors__AllowedOrigins__0` con el origen exacto del frontend.
- La protección CSRF (encabezado + `Origin`/`Referer` + CORS) sigue activa, pero los navegadores que bloquean cookies de terceros impedirán recuperar la sesión al recargar. Prefiere subdominios del mismo dominio registrable (`app.loancalcrd.do` / `api.loancalcrd.do`), que son *same-site*.

## B.2 Variables de entorno de la API

| Variable | Ejemplo / nota |
|---|---|
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `ConnectionStrings__LoanCalcDb` | `Host=…;Port=5432;Database=loancalcrd;Username=…;Password=…;SSL Mode=Require` |
| `Jwt__SigningKey` | 48+ bytes aleatorios en Base64. Rotarla invalida todos los access tokens. |
| `Auth__FrontendAccountUrl` | `https://<sitio>/account` (HTTPS obligatorio) |
| `Auth__Cookie__SameSite` | `Strict` |
| `Cors__AllowedOrigins__0` | `https://<sitio>` |
| `Smtp__Host` / `Smtp__Port` | Proveedor con TLS, normalmente `587` |
| `Smtp__From` / `Smtp__FromName` | Remitente verificado (SPF/DKIM/DMARC configurados en el dominio) |
| `Smtp__Username` / `Smtp__Password` | Credenciales del proveedor |
| `DataProtection__KeysPath` | Volumen persistente, p. ej. `/var/loancalcrd/keys` |
| `ForwardedHeaders__KnownProxies__0` / `KnownNetworks__0` | IP o red del balanceador/proxy del hosting |

Generar la clave JWT:

```bash
openssl rand -base64 48
```

Guarda los secretos en el gestor del proveedor (variables cifradas), nunca en `appsettings*.json` ni en el repositorio.

## B.3 Base de datos

1. PostgreSQL 17 con TLS y un usuario dedicado (sin permisos de superusuario).
2. Aplica migraciones como paso explícito del despliegue:

   ```bash
   dotnet ef migrations bundle --project backend/src/LoanCalcRD.Infrastructure/LoanCalcRD.Infrastructure.csproj \
     --startup-project backend/src/LoanCalcRD.Api/LoanCalcRD.Api.csproj --configuration Release -o efbundle
   ./efbundle --connection "$ConnectionStrings__LoanCalcDb"
   ```

3. Haz copia de seguridad antes de migrar. Las migraciones de la Fase 6 son aditivas y reversibles (verificado en CI).

## B.4 Health checks

- `GET /health/live` — el proceso responde (sin dependencias). Úsalo como *liveness*.
- `GET /health` — incluye PostgreSQL. Úsalo como *readiness*.

## B.5 Lista de verificación previa a habilitar cuentas

- [ ] API en HTTPS y HSTS activo.
- [ ] Proxy `/api/*` configurado y probado (`SameSite=Strict` funciona: recargar la página mantiene la sesión).
- [ ] `Jwt__SigningKey`, `DataProtection__KeysPath` y SMTP configurados.
- [ ] Correo real recibido: confirmación, recuperación, aviso de cambio de contraseña (verificación manual, no cubierta por CI).
- [ ] `ForwardedHeaders` configurado para que el rate limiting vea la IP real del cliente.
- [ ] Migraciones aplicadas y `GET /health` en verde.
- [ ] `features.accounts = true` en el build de producción.
