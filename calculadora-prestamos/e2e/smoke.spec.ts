import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Smoke del BUILD DE PRODUCCIÓN (local, Deploy Preview o sitio publicado).
 * Comprueba que la versión candidata FUNCIONA, no solo que compila.
 */
const expectCloudflare = process.env['E2E_EXPECT_CLOUDFLARE'] === '1';
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

  test('privacidad, términos, contacto y acerca del proyecto son públicos y accesibles', async ({ page }) => {
    const { apiCalls, problems } = watch(page);
    for (const item of [
      { path: '/privacy', title: 'Política de privacidad' },
      { path: '/terms', title: 'Términos de Uso' },
      { path: '/contact', title: 'Contacto' },
      { path: '/about', title: 'Acerca de LoanCalc RD' },
      { path: '/guide', title: 'Guía para entender tu préstamo' }
    ]) {
      const response = await page.goto(item.path);
      expect(response?.status(), item.path).toBe(200);
      await expect(page.getByRole('heading', { name: item.title, level: 1 })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Términos de Uso' }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Contacto', exact: true }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), item.path).toBeLessThanOrEqual(0);
      const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(scan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id), item.path).toEqual([]);
    }
    await page.goto('/guide');
    await expect(page.getByRole('heading', { name: 'Cómo se calcula una cuota mensual' })).toBeVisible();
    await expect(page.getByText('RD$ 7,500', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Probar la calculadora' }).first()).toBeVisible();
    await page.goto('/contact');
    await expect(page.getByRole('link', { name: /Abrir una incidencia en GitHub/ })).toHaveAttribute('href', 'https://github.com/Jairo0811/CalculadoraPrestamos/issues/new');
    await expect(page.getByText(/las incidencias de GitHub son públicas/i)).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Contacto', level: 1 })).toBeVisible();
    expect(apiCalls).toEqual([]);
    expect(problems).toEqual([]);
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
    await expect(page.getByText('Las tasas precargadas son', { exact: false })).toBeVisible();
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
    const pdfChunks: Buffer[] = [];
    for await (const chunk of pdfStream) {
      pdfChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const pdfContents = Buffer.concat(pdfChunks).toString('latin1');
    expect(pdfContents.slice(0, 5)).toBe('%PDF-');
    // El PDF debe incluir la imagen PNG del QR, no solo las tablas del préstamo.
    expect(pdfContents).toContain('/Subtype /Image');

    const [excel] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel', exact: true }).click()]);
    expect(excel.suggestedFilename()).toMatch(/\.xls$/);
  });

  test('exporta el PDF de abonos extraordinarios con QR incrustado', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Descargas verificadas en escritorio y tableta');
    await simulate(page);
    await page.getByLabel('Monto del abono').fill('50000');
    await page.getByRole('button', { name: 'Calcular ahorro' }).click();
    const exportButton = page.getByRole('button', { name: 'Exportar escenario a PDF' });
    await expect(exportButton).toBeVisible();

    const [pdf] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);
    expect(pdf.suggestedFilename()).toMatch(/^LoanCalcRD-Abonos-.*\.pdf$/);
    const pdfStream = await pdf.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of pdfStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const pdfContents = Buffer.concat(chunks).toString('latin1');
    expect(pdfContents.slice(0, 5)).toBe('%PDF-');
    expect(pdfContents).toContain('/Subtype /Image');
  });


  test('aplica abonos anuales y muestra sus meses reales en resultados', async ({ page }) => {
    await simulate(page);
    await page.getByLabel('Monto del abono').fill('2000');
    await page.getByLabel('Aplicar desde el mes').fill('12');
    await page.getByRole('radio', { name: /Abono anual/ }).check();

    await expect(page.getByText('El primer abono se aplicará en el mes', { exact: false })).toBeVisible();
    await expect(page.getByText('doble sueldo o bonificación anual', { exact: false })).toBeVisible();

    await page.getByRole('button', { name: 'Calcular ahorro' }).click();
    await expect(page.locator('.extra-payment-applied-note')).toContainText('12, 24');
    const rowsWithExtra = await page.locator('.extra-payment-row td:first-child').allTextContents();
    expect(rowsWithExtra.map(month => Number(month.trim()))).toEqual([12, 24]);
    await expect(page.getByText('Intereses ahorrados')).toBeVisible();
  });

  test('exporta abonos anuales a PDF y Excel con frecuencia correcta', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Descargas verificadas en escritorio y tableta');
    await simulate(page);
    await page.getByLabel('Monto del abono').fill('2000');
    await page.getByRole('radio', { name: /Abono anual/ }).check();
    await page.getByRole('button', { name: 'Calcular ahorro' }).click();

    const [excel] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar escenario a Excel' }).click()
    ]);
    expect(excel.suggestedFilename()).toMatch(/\.xls$/);
    const excelStream = await excel.createReadStream();
    const excelChunks: Buffer[] = [];
    for await (const chunk of excelStream) {
      excelChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    expect(Buffer.concat(excelChunks).toString('utf8')).toContain('Abono anual (cada 12 meses)');

    const [pdf] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar escenario a PDF' }).click()
    ]);
    expect(pdf.suggestedFilename()).toMatch(/^LoanCalcRD-Abonos-.*\.pdf$/);
    const pdfStream = await pdf.createReadStream();
    const pdfChunks: Buffer[] = [];
    for await (const chunk of pdfStream) {
      pdfChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const pdfBody = Buffer.concat(pdfChunks).toString('latin1');
    expect(pdfBody.slice(0, 5)).toBe('%PDF-');
    expect(pdfBody).toContain('/Subtype /Image');
  });

  test('espaciado entre todas las tarjetas de resultados en móvil', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await simulate(page);
    await page.getByLabel('Monto del abono').fill('25000');
    await page.getByRole('button', { name: 'Calcular ahorro' }).click();
    await expect(page.getByText('Intereses ahorrados')).toBeVisible();

    for (const selector of ['.share-card', '.history-card', '.table-card']) {
      await expect(page.locator(selector)).toBeVisible();
    }

    const layout = await page.evaluate(() => {
      // Cada contenedor apila tarjetas independientes en una columna en móvil.
      const stacks = ['.analysis-top', '.analysis-charts', '.insights-grid', '.extra-payment-results', '.savings-grid', '.save-grid'];
      const gaps: Record<string, number> = {};
      for (const selector of stacks) {
        const children = [...document.querySelector(selector)!.children];
        children.slice(1).forEach((child, index) => {
          const gap = child.getBoundingClientRect().top - children[index].getBoundingClientRect().bottom;
          gaps[`${selector} #${index + 1}`] = Math.round(gap);
        });
      }
      return {
        gaps,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        deleteHeight: document.querySelector('.history-delete')!.getBoundingClientRect().height
      };
    });
    expect(Object.keys(layout.gaps).length).toBeGreaterThan(5);
    for (const [pair, gap] of Object.entries(layout.gaps)) {
      expect(gap, pair).toBeGreaterThanOrEqual(20);
    }
    expect(layout.deleteHeight).toBeGreaterThanOrEqual(44);
    expect(layout.overflow).toBeLessThanOrEqual(0);
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
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id), '/results').toEqual([]);
  });

  test('cabeceras de seguridad y caché del despliegue', async ({ request }) => {
    test.skip(!expectCloudflare, 'Solo aplica al sitio servido por Cloudflare Pages');

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
