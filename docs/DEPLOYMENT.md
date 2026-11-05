# Guía de despliegue y secretos — LoanCalc RD v3

- **Parte A** — Despliegue continuo del frontend en Netlify (activo).
- **Parte B** — Publicación de la API, base de datos y cuentas (Fase 8, **pendiente**: el frontend publicado mantiene las cuentas desactivadas con `features.accounts = false`).

---

# Parte A — Despliegue continuo del frontend (Netlify)

## A.1 Flujo

```text
rama de trabajo ──► Pull Request a master
                     ├─ GitHub Actions: LoanCalc RD CI ........ test-and-build · e2e (dev + smoke del build de producción)
                     ├─ GitHub Actions: LoanCalc RD Backend CI . backend (build, migraciones, upgrade Fase 5, xUnit, NuGet)
                     ├─ Netlify (integración nativa) ........... Deploy Preview → deploy-preview-<n>--loancalcrd.netlify.app
                     └─ GitHub Actions: Netlify Verify ......... espera el Deploy Preview y ejecuta el smoke sobre él
         revisión + checks obligatorios en verde ──► merge a master
                     ├─ Netlify (integración nativa) ........... build y publicación automática en loancalcrd.netlify.app
                     └─ GitHub Actions: Netlify Verify ......... espera a que producción sirva ESE commit y ejecuta el smoke
```

**Estrategia configurada: integración nativa GitHub → Netlify.** No hay tokens de Netlify en el repositorio ni workflows que desplieguen con Netlify CLI: el workflow `netlify-verify.yml` solo *verifica* lo que Netlify publica.

Evidencia verificada desde GitHub (sin acceso al panel de Netlify): la app de Netlify publica el estado `netlify/loancalcrd/deploy-preview` y comenta en los PR; el PR #57 obtuvo `https://deploy-preview-57--loancalcrd.netlify.app` y Netlify aplicó las reglas de cabeceras y redirecciones de `netlify.toml`. La publicación automática de `master` en producción **no** es visible desde GitHub (Netlify no publica estado en esos commits); el job `production` de `netlify-verify.yml` la comprueba tras cada merge.

## A.2 Configuración versionada (`netlify.toml`)

| Ajuste | Valor | Motivo |
|---|---|---|
| Base directory | `calculadora-prestamos` | Proyecto Angular |
| Build command | `npm ci && npm run build && node scripts/write-build-info.mjs` | Build de producción + `build-info.json` con el commit publicado |
| Publish directory | `dist/calculadora-prestamos/browser` | Salida de `@angular/build:application` (Angular 21) |
| Node | 22 | Igual que CI |
| Ignore | `scripts/netlify-ignore.sh` | Omite *branch deploys* y builds sin cambios de frontend |
| SPA | `/* → /index.html (200)` | Refrescar `/calculator` o `/results` funciona |

Producción y Deploy Previews usan **el mismo build de producción**: `apiBaseUrl: '/api/v1'` (sin `localhost`), cuentas desactivadas, sin credenciales ni bases de datos.

### Caché

| Recurso | Cache-Control |
|---|---|
| `index.html` y rutas SPA | Por defecto de Netlify: `public, max-age=0, must-revalidate` → nunca se sirve un `index.html` antiguo tras desplegar |
| `/*.js`, `/*.css`, `/media/*` (con hash) | `public, max-age=31536000, immutable` |
| `/assets/*` (logos WebP sin hash) | `public, max-age=86400, stale-while-revalidate=604800` |
| `/build-info.json` | `no-store` |

Netlify comprime automáticamente con Brotli/gzip. No se fija `Cache-Control` en `/*` porque Netlify concatena valores cuando varias reglas definen la misma cabecera.

## A.3 Ajustes que requieren el panel de Netlify

Estos pasos **no** pueden versionarse ni comprobarse desde GitHub. Revísalos en *app.netlify.com → loancalcrd*:

1. **Project configuration → Build & deploy → Continuous deployment → Repository**: vinculado a `Jairo0811/CalculadoraPrestamos`.
2. **Branches and deploy contexts**:
   - *Production branch*: `master`.
   - *Branch deploys*: **Deploy only the production branch** (además, `netlify-ignore.sh` omite cualquier branch deploy).
   - *Deploy Previews*: **Any pull request against your production branch**.
3. **Build settings**: deja vacíos los campos que define `netlify.toml` (el archivo tiene prioridad sobre la UI).
4. **Deploys → Auto publishing**: activo (si está bloqueado, los builds de `master` se generan pero no se publican).
5. **Project configuration → General → Visitor access (Site protection)**: hoy los Deploy Previews exigen iniciar sesión en Netlify (comprobado: redirigen a `app.netlify.com/edge-access`). Así nadie fuera del equipo los ve, pero **GitHub Actions no puede verificarlos** y el job `deploy-preview` lo indica con un aviso. Las vistas previas no contienen secretos ni conectan con APIs (cuentas desactivadas), por lo que puedes:
   - quitar la protección de despliegues no productivos para habilitar la verificación automática, o
   - mantenerla y revisar la vista previa manualmente con tu sesión de Netlify.
   La producción **nunca** debe estar protegida (el job `production` falla si lo está).
6. **Environment variables**: ninguna es necesaria hoy. No añadas secretos de backend al frontend.
7. Opcional: **Deploy notifications → GitHub commit statuses** para todos los contextos, si quieres ver también el estado de producción en cada commit de `master`.

## A.4 Protección de `master` (GitHub) — **pendiente de activar en GitHub**

No pudo aplicarse desde la sesión automatizada (sin permiso de escritura en la API de protección). Configúrala en *Settings → Rules → Rulesets → New branch ruleset* (o *Settings → Branches → Add classic branch protection rule*):

1. **Target**: rama `master`. **Enforcement**: Active.
2. **Require a pull request before merging** (aprobaciones requeridas: 0, para poder fusionar tus propios PR tras revisarlos).
3. **Require status checks to pass**, añadiendo: `test-and-build`, `e2e` y `backend` (fuente: GitHub Actions).
4. **Block force pushes** y **Restrict deletions**.
5. Opcional: **Require conversation resolution before merging**.
6. Deja tu usuario en *Bypass list* solo si quieres poder hacer correcciones urgentes.

`Netlify Verify` no se marca como obligatorio porque solo se ejecuta cuando cambia el frontend. `backend` se ejecuta en todos los PR precisamente para poder exigirlo.

## A.5 Verificación posterior al despliegue

Automática: job `production` de **LoanCalc RD Netlify Verify** (pestaña *Actions* o el commit en `master`). Comprueba que `https://loancalcrd.netlify.app/build-info.json` sirve el commit fusionado y ejecuta el smoke: Home sin errores de consola, logo, rutas profundas, cuentas desactivadas y sin llamadas a la API, simulación completa con tabla y RD$, PDF/Excel, responsive, WCAG A/AA, cabeceras de seguridad y caché.

Manual (2 minutos):

1. Abre `https://loancalcrd.netlify.app/build-info.json` → `commit` debe ser el último de `master`.
2. Recarga con la caché vacía `/`, `/calculator` y `/results`.
3. Simula un préstamo y descarga PDF y Excel.
4. Abre la consola del navegador: sin errores ni peticiones a `localhost` o `/api`.

Local, con el mismo build: `npm run build && node scripts/write-build-info.mjs && npm run e2e:smoke`.
Contra cualquier URL: `E2E_BASE_URL=https://deploy-preview-57--loancalcrd.netlify.app E2E_EXPECT_NETLIFY=1 npx playwright test`.

## A.6 Rollback

- **Inmediato (sin código):** Netlify → *Deploys* → elige el último despliegue correcto → **Publish deploy**. Netlify sirve ese build al instante. Mientras tanto, *Lock publishing* evita que un nuevo merge lo sustituya.
- **Definitivo:** `git revert <commit>` en una rama → PR → checks → merge. Después desbloquea *Auto publishing*.

## A.7 Diagnóstico de fallos

| Síntoma | Causa probable | Acción |
|---|---|---|
| El PR no tiene Deploy Preview | Solo cambió backend/docs (`netlify-ignore.sh` omitió el build) o Deploy Previews desactivado | Revisa el comentario de Netlify en el PR; ajusta A.3-2 |
| `Netlify Verify / deploy-preview` falla esperando | Build de Netlify fallido | Abre el enlace del estado `netlify/loancalcrd/deploy-preview` → log |
| `deploy-preview` en verde con aviso "protegido" | Visitor access activo para despliegues no productivos | Ver A.3-5; el smoke del mismo build ya corre en `LoanCalc RD CI / e2e` |
| `Netlify Verify / production` no ve el commit | Auto publishing bloqueado, rama de producción distinta o build fallido | A.3-2/A.3-4 y log del deploy |
| Rutas devuelven 404 al refrescar | Regla SPA no aplicada | El check *Redirect rules* de Netlify debe procesar ≥ 1 regla |
| Usuarios ven una versión antigua | Caché del navegador de `index.html` | Comprueba que `/` responde `max-age=0`; los JS con hash nunca se reutilizan entre versiones |
| `npm ci` falla en Netlify | Lockfile desincronizado | Regenera el lockfile con `npm install` (npm 11) y súbelo |
| Error `NODE_VERSION` | Node distinto a 22 | `netlify.toml` fija `NODE_VERSION = "22"` |

---

# Parte B — API, base de datos y cuentas (Fase 8)

## B.1 Topología recomendada

```text
Navegador ──HTTPS──► loancalcrd.netlify.app (o dominio propio)
                     ├── /*        → Angular (estático)
                     └── /api/*    → proxy Netlify ──HTTPS──► API ASP.NET Core ──► PostgreSQL 17
```

**Evaluación:** el proxy de mismo origen `/api/*` es la estrategia adecuada para esta topología (frontend estático en Netlify + API ASP.NET Core en otro proveedor): mantiene `SameSite=Strict`, evita CORS en el navegador y no depende de cookies de terceros. Inconvenientes asumidos: un salto de red adicional y que la IP del cliente llega en `X-Forwarded-For` (configura `ForwardedHeaders`). Por eso la regla queda **comentada**: no se activa hasta que exista una API real.

**Por qué un proxy de mismo origen:** el refresh token vive en una cookie `HttpOnly` con `SameSite=Strict`. Si Angular y la API están en sitios distintos (por ejemplo `*.netlify.app` y `*.onrender.com`), la cookie es de terceros: con `Strict` o `Lax` el navegador no la envía en `fetch`, y con `None` muchos navegadores la bloquean por la protección contra rastreo. Con el proxy, para el navegador todo es el mismo origen y `Strict` funciona.

Pasos:

1. Publica la API en HTTPS.
2. En `netlify.toml`, descomenta la regla `/api/*` (antes de la regla SPA) con el dominio real de la API.
3. Mantén `apiBaseUrl: '/api/v1'` en `environment.production.ts`.
4. Configura en la API `Cors__AllowedOrigins__0=https://<sitio-netlify>` (para el `Origin` que reenvía el proxy) y `Auth__Cookie__SameSite=Strict`.
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
