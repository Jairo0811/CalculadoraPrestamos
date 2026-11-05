import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Smoke del BUILD DE PRODUCCIÓN (local, Deploy Preview o sitio publicado).
 * Comprueba que la versión candidata FUNCIONA, no solo que compila.
 */
const expectNetlify = process.env['E2E_EXPECT_NETLIFY'] === '1';
const expectedCommit = process.env['E2E_EXPECT_COMMIT'];

/** Registra errores de consola/página y cualquier intento de llamar a la API o a localhost. */
function watch(page: Page) {
  const problems: string[] = [];
  const apiCalls: string[] = [];
  page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('request', request => {
    const url = request.url();
    if (url.includes('localhost:5000') || new URL(url).pathname.startsWith('/api/')) apiCalls.push(url);
  });
  return { problems, apiCalls };
}

async function simulate(page: Page) {
  await page.goto('/calculator');
  await page.getByLabel('Monto solicitado').fill('500000');
  await page.getByLabel('Tipo de préstamo').selectOption('Personal');
  await page.getByLabel('Tasa anual').fill('18');
  await page.getByRole('button', { name: /^36 meses$/ }).click();
  await page.getByRole('button', { name: 'Calcular préstamo' }).click();
  await expect(page).toHaveURL(/\/results$/);
}

test.describe('Smoke del build de producción', () => {
  test('Home carga sin errores, con logo y sin llamadas a la API', async ({ page }) => {
    const { problems, apiCalls } = watch(page);
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('costo real');
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();

    const logo = page.locator('img.hero-logo');
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

    expect(problems).toEqual([]);
    expect(apiCalls).toEqual([]);
  });

  test('las rutas profundas funcionan al refrescar (fallback SPA)', async ({ page }) => {
    for (const path of ['/calculator', '/results', '/ruta-inexistente']) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.locator('app-root')).not.toBeEmpty();
    }
    await page.goto('/calculator');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Calcula tu préstamo' })).toBeVisible();
  });

  test('las cuentas están desactivadas en la versión pública', async ({ page }) => {
    const { apiCalls } = watch(page);
    await page.goto('/account');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: /Iniciar sesión|Entrar/ })).toHaveCount(0);
    await page.goto('/account/security');
    await expect(page).toHaveURL(/\/$/);
    expect(apiCalls).toEqual([]);
  });

  test('simulación completa con tabla, gráficos y formato RD$', async ({ page }) => {
    const { problems, apiCalls } = watch(page);
    await simulate(page);

    await expect(page.getByText('RD$ 18,076.20').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tabla de amortización' })).toBeVisible();
    await expect(page.locator('table tbody tr')).not.toHaveCount(0);
    await expect(page.getByText('no asesoría financiera personalizada')).toBeVisible();

    // Recarga en /results: la simulación persiste en el dispositivo.
    await page.reload();
    await expect(page.getByText('RD$ 18,076.20').first()).toBeVisible();

    expect(problems).toEqual([]);
    expect(apiCalls).toEqual([]);
  });

  test('exporta PDF y Excel', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Descargas verificadas en escritorio y tableta');
    await simulate(page);

    const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF', exact: true }).click()]);
    expect(pdf.suggestedFilename()).toMatch(/^LoanCalcRD-.*\.pdf$/);
    const pdfStream = await pdf.createReadStream();
    const head = await new Promise<string>(resolve => pdfStream.once('data', chunk => resolve(chunk.toString('latin1', 0, 5))));
    expect(head).toBe('%PDF-');

    const [excel] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel', exact: true }).click()]);
    expect(excel.suggestedFilename()).toMatch(/\.xls$/);
  });

  test('responsive sin desplazamiento horizontal y sin violaciones WCAG graves', async ({ page }) => {
    for (const path of ['/', '/calculator']) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id), path).toEqual([]);
    }
    await simulate(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test('cabeceras de seguridad y caché del despliegue', async ({ request }) => {
    test.skip(!expectNetlify, 'Solo aplica al sitio servido por Netlify');

    const html = await request.get('/');
    const headers = html.headers();
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['cache-control'] ?? '').toMatch(/max-age=0/);

    const body = await html.text();
    const script = body.match(/src="(main-[A-Z0-9]+\.js)"/)?.[1];
    expect(script, 'index.html debe referenciar el bundle principal con hash').toBeTruthy();
    const js = await request.get('/' + script);
    expect(js.status()).toBe(200);
    expect(js.headers()['cache-control']).toContain('immutable');
    expect(body).not.toContain('localhost:5000');
  });

  test('build-info identifica el commit desplegado', async ({ request }) => {
    test.skip(!expectedCommit, 'Solo cuando se espera un commit concreto');
    const info = await (await request.get('/build-info.json')).json();
    expect(info.commit).toBe(expectedCommit);
  });
});
