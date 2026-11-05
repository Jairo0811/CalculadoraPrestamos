import { defineConfig, devices } from '@playwright/test';

/**
 * Dos modos:
 *
 * 1. Desarrollo (por defecto): `ng serve` con cuentas habilitadas. La API de cuentas se SIMULA con
 *    `page.route`; valida la interfaz y la sesión en el navegador, no ASP.NET Core/PostgreSQL/SMTP.
 *
 * 2. Smoke de un sitio ya compilado (`E2E_BASE_URL`): ejecuta solo `e2e/smoke.spec.ts` contra el build
 *    de producción (local, Deploy Preview de Cloudflare o el sitio publicado). Sin servidor propio.
 *    `E2E_EXPECT_CLOUDFLARE=1` activa además las comprobaciones de cabeceras de Cloudflare Pages y
 *    `E2E_EXPECT_COMMIT=<sha>` verifica que el despliegue sirve exactamente ese commit.
 */
const externalBaseUrl = process.env['E2E_BASE_URL'];

export default defineConfig({
  testDir: './e2e',
  testMatch: externalBaseUrl ? 'smoke.spec.ts' : '*.spec.ts',
  testIgnore: externalBaseUrl ? [] : ['smoke.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',
  use: {
    baseURL: externalBaseUrl ?? 'http://localhost:4300',
    trace: 'retain-on-failure',
    locale: 'es-DO',
    acceptDownloads: true
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'npx ng serve --port 4300',
        url: 'http://localhost:4300',
        reuseExistingServer: !process.env['CI'],
        timeout: 180_000
      }
});
