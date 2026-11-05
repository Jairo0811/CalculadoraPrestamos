# LoanCalc RD v3 — Fase 7: plataforma financiera personal

**Estado:** trabajo en curso, PR #59. No publicado en el sitio público de Cloudflare Pages.

## Alcance de la fase

La Fase 6 ya incluye en ASP.NET Core 10 los endpoints protegidos de `/api/v1/simulations`. La Fase 7 los integra en Angular 21 sin reconstruir las capas de dominio y persistencia.

| Acción | Interfaz Angular | API |
|---|---|---|
| Guardar desde resultados | Botón condicionado a sesión iniciada | POST `/api/v1/simulations` |
| Consultar historial | `/account/simulations` | GET `/api/v1/simulations` |
| Abrir y recalcular | Motor matemático local, sin PII | GET listado |
| Cambiar nombre | Editor en línea | PATCH `/{id}/name` |
| Favorito | Botón accesible | PATCH `/{id}/favorite` |
| Eliminar | Confirmación explícita | DELETE `/{id}` |
| Comparar dos | Recalcula dos escenarios y muestra cuatro métricas | Datos previamente leídos |
| Importar historial | Confirmación y deduplicación local | POST por cada escenario nuevo |

## Privacidad y aislamiento

- `AuthService` y `authInterceptor` de Fase 6 gestionan JWT, renovación y respuestas no autorizadas.
- `authGuard` restringe la ruta privada; el backend sigue aplicando autorización por propietario para cada acción.
- `LoanApiService.toCreatePayload` transmite solamente `name` (descripción del préstamo), `loanType`, `amount`, `annualRate` y `termMonths`.
- **Nunca** se transmite `firstName`, `lastName`, `birthDate` o `documentId` en las simulaciones privadas.
- La importación del historial del navegador es opcional: la aplicación solicita confirmación, filtra escenarios duplicados y conserva intacto el historial local.
- Al recuperar un escenario de PostgreSQL se crean campos personales vacíos y se vuelve a calcular la amortización en el dispositivo.
- Los indicadores de préstamos guardados no representan deudas reales ni saldos bancarios.
- Los datos privados no se incorporan a enlaces públicos ni a HTML Open Graph.

## Acceso local

1. Iniciar PostgreSQL 17 y API .NET 10 conforme a `backend/README.md`; configurar `Jwt__SigningKey` y SMTP con datos de desarrollo.
2. En `calculadora-prestamos/`: `npm ci` y `npm start`.
3. Registrar usuario, confirmar el correo y entrar. Usar `/account/simulations` para gestionar sus escenarios.
4. Crear una simulación desde `/calculator`; en `/results`, usar `Guardar en mi cuenta`.
5. Cerrar sesión y abrir la misma cuenta desde otro navegador conectado a la misma API: el listado y favoritos deben aparecer. **Esta verificación real entre dispositivos aún depende de infraestructura desplegada.**

## Pruebas

- Angular/Vitest: mapeo anónimo, historial privado, favoritos, renombrado, comparación, fallos de red, importación voluntaria.
- Playwright/E2E: flujo de simulaciones privadas usando `e2e/api-mock.ts`, **API simulada**, no PostgreSQL real.
- Backend xUnit/PostgreSQL: aislamiento por `userId` del JWT y protección de todos los recursos (Fase 6).

## Publicación

- `calculadora-prestamos/src/environments/environment.production.ts` mantiene `features.accounts = false`.
- Cloudflare Pages publica solamente la calculadora pública con su vista previa de WhatsApp.
- El backend ASP.NET Core, PostgreSQL, SMTP, proxy HTTPS de mismo origen y pruebas reales de extremo a extremo en entornos desplegados pertenecen a la **Fase 8**.
- No activar cuentas en producción antes de configurar esos servicios y comprobar login, refresh, CORS/CSRF y cookies en HTTPS.

## Criterios de revisión

- [ ] Angular CI (unitarias/build) verde.
- [ ] Playwright E2E (API simulada) verde.
- [ ] Backend CI + PostgreSQL verde.
- [ ] Verificar que el build Cloudflare todavía oculta `/account`.
- [ ] Revisar accesibilidad y vistas móvil/tableta/escritorio.
- [ ] Revisar que ningún dato personal se transmita al API ni aparezca en enlaces.
- [ ] Revisar el PR #59; no fusionar mientras haya checks fallidos.
