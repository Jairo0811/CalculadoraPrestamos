# Migración controlada: Angular 21 → 22

> Esta guía corresponde a la rama `upgrade/angular22-full-migration` y describe los cambios y controles para integrar Angular 22 **solo después de aprobar el CI y el despliegue de vista previa**.

## Matriz de compatibilidad

| Componente | Antes | Candidato |
| --- | --- | --- |
| Angular (Core, Common, Compiler, Forms, Router, Browser, Server) | 21.2.x | 22.2.4 |
| Angular CLI, Build, SSR | 21.2.x | 22.2.6 |
| TypeScript | 5.9 | 6.0.3 |
| Vitest | 4.1 | 5.1.0 |
| @types/node | 20.x | 22.x |
| Node.js (CI / Cloudflare) | 22 (sin fijar) | 22.23.4 |
| Playwright | 1.64.1 | 1.64.1 |
| RxJS | 7.8 | 7.8 (sin cambio) |
| Backend | .NET 10 | .NET 10 (sin cambio) |

Versiones fijadas dentro de sus familias compatibles. El `package-lock.json` se generó mediante `npm install --package-lock-only` y se probó con `npm ci`, sin `--force` ni `--legacy-peer-deps`.

Referencias: [matriz oficial de compatibilidad](https://angular.dev/reference/versions) y [guía oficial de actualización](https://angular.dev/update-guide).

## Cambios y no objetivos

- Mantener los cálculos del método francés, comparaciones, PDFs/Excel y rutas públicas.
- Mantener desactivadas las cuentas en build de producción hasta la fase 8.
- Preservar los controles de AdSense, `ads.txt`, metadatos sociales, `_redirects` y `build-info.json`.
- No actualizar el Backend .NET, Npgsql ni las migraciones de PostgreSQL.
- Evitar cambios de UX, funcionalidades y estilos durante la migración de framework.

## Puertas de calidad antes de fusionar

1. `npm ci` sin conflictos de peers.
2. `npm audit --omit=dev --audit-level=moderate` sin incidencias de producción moderadas o mayores.
3. `npm run test:ci`, `npm run test:adsense`.
4. `npm run build` y `node scripts/check-social-preview.mjs`.
5. `npx playwright install --with-deps chromium`, `npm run e2e`, `npm run e2e:smoke`.
6. GitHub Actions Backend CI; Cloudflare Pages Preview en rama.
7. Revisar que el output público siga generado bajo `dist/calculadora-prestamos/browser` o la ruta establecida por el proyecto, y que el script de verificación no falle.
8. Ejecutar los esquemas de migración de Angular si el compilador, la guía de actualización o la ejecución lo requiere, en un commit independiente revisable.

### Validación local

```powershell
cd calculadora-prestamos
node --version
npm ci
npm run test:ci
npm run test:adsense
npm run build
npm run e2e
npm run e2e:smoke
```

**Despliegue:** Cloudflare Pages utiliza `calculadora-prestamos/` como directorio raíz. Comprueba que la variable opcional `NODE_VERSION` en Cloudflare no fuerce una versión incompatible: debe ser `22.23.4` o alguna versión admitida por Angular 22. El archivo `.node-version` se incluye para fijar un valor compatible.

**Rollback:** si tras fusionar aparece una regresión, usar el mecanismo de rollback de Cloudflare y un `git revert` del commit de migración siguiendo `docs/DEPLOYMENT.md`.
