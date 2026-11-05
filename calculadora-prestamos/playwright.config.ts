import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas E2E del frontend.
 *
 * Se ejecutan contra `ng serve` (configuración de desarrollo, cuentas habilitadas).
 * La API de autenticación se SIMULA con `page.route`: estas pruebas validan la interfaz,
 * la navegación y el manejo de sesión en el navegador, NO la integración real con
 * ASP.NET Core, PostgreSQL ni SMTP (cubiertas por las pruebas xUnit del backend).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4300',
    trace: 'retain-on-failure',
    locale: 'es-DO'
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ],
  webServer: {
    command: 'npx ng serve --port 4300',
    url: 'http://localhost:4300',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000
  }
});
