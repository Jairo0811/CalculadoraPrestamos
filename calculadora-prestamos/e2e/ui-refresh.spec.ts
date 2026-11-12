import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { API } from './api-mock';

/**
 * Regresiones del rediseño «Fintech Premium»: la interfaz cambió, el cálculo no.
 * Todas las cifras esperadas salen del mismo motor (método francés) que ya validan
 * las pruebas unitarias de LoanCalculatorService.
 */
async function simulate(page: Page, amount = '500000', rate = '18', term = /^36 meses$/) {
  await page.goto('/calculator');
  await page.getByLabel('Monto solicitado').fill(amount);
  await page.getByLabel('Tipo de préstamo').selectOption('Personal');
  await page.getByLabel('Tasa anual').fill(rate);
  await page.getByRole('button', { name: term }).click();
  await page.getByRole('button', { name: 'Calcular préstamo' }).click();
  await expect(page).toHaveURL(/\/results$/);
}

async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  return results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id}: ${v.nodes.length}`);
}

test.describe('UI refresh — resultados', () => {
  test.beforeEach(async ({ page }) => {
    // La experiencia pública no depende de la API.
    await page.route(`${API}/**`, route => route.abort('connectionrefused'));
  });

  test('rechaza una tasa de 0 % con un error contextual y enfoca el campo', async ({ page }) => {
    await page.goto('/calculator');
    await page.getByLabel('Monto solicitado').fill('500000');
    await page.getByLabel('Tipo de préstamo').selectOption('Personal');
    await page.getByLabel('Tasa anual').fill('0');
    await page.getByRole('button', { name: /^36 meses$/ }).click();
    await page.getByRole('button', { name: 'Calcular préstamo' }).click();

    await expect(page.getByText('Indica una tasa anual mayor que 0 %.')).toBeVisible();
    await expect(page.getByLabel('Tasa anual')).toBeFocused();
    await expect(page).toHaveURL(/\/calculator$/);
  });

  test('abre resultados arriba, con el foco en el título y la cuota a la vista', async ({ page }) => {
    await simulate(page);

    await expect(page.getByRole('heading', { level: 1, name: 'Resumen del préstamo' })).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator('.payment-label')).toHaveText('Cuota mensual estimada');
    await expect(page.locator('.payment-value')).toHaveText('RD$ 18,076.20');
    await expect(page.locator('.payment-value')).toBeInViewport();
    await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeVisible();
  });

  test('la navegación interna lleva a cada sección y marca la actual', async ({ page }) => {
    await simulate(page);
    const nav = page.getByRole('navigation', { name: 'Secciones de resultados' });
    await expect(nav.getByRole('link')).toHaveText(['Resumen', 'Análisis financiero', 'Abonos extraordinarios', 'Comparador', 'Amortización']);

    await nav.getByRole('link', { name: 'Amortización' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Tabla de amortización' })).toBeFocused();
    await expect(nav.getByRole('link', { name: 'Amortización' })).toHaveAttribute('aria-current', 'location');
    await expect(page).toHaveURL(/\/results$/);
    // El cronograma conserva todas las cuotas.
    await expect(page.locator('#amortizacion tbody tr')).toHaveCount(36);
  });

  test('LoanCalc Score: calificación B explicada como indicador matemático interno', async ({ page }) => {
    await simulate(page);
    await expect(page.locator('.score-grade')).toHaveText('B');
    await expect(page.getByText('No es un puntaje de crédito')).toBeVisible();
    await expect(page.locator('.score-scale [aria-current="true"]')).toContainText('25–40');
  });

  test('abono único para reducir plazo: mes aplicado, fila resaltada y comparación', async ({ page }) => {
    await simulate(page);
    await page.getByLabel('Monto del abono').fill('50000');
    await page.getByLabel('Aplicar desde el mes').fill('12');
    await page.getByRole('radio', { name: /Abono único/ }).check();
    await page.getByRole('radio', { name: /Reducir el plazo/ }).check();
    await expect(page.getByText('Un abono en el mes')).toBeVisible();
    await page.getByRole('button', { name: 'Calcular ahorro' }).click();

    await expect(page.locator('.extra-payment-applied-note')).toContainText('El abono se aplicó en el mes 12');
    const rows = await page.locator('.extra-payment-row td:first-child').allTextContents();
    expect(rows.map(r => r.trim())).toEqual(['12']);
    await expect(page.getByRole('heading', { name: 'Préstamo original frente a préstamo con abonos' })).toBeVisible();
    await expect(page.getByText('Meses ahorrados')).toBeVisible();
    await expect(page.getByText('el ahorro no está garantizado', { exact: false })).toBeVisible();
  });

  test('abono mensual para reducir la cuota: cuota recalculada y meses aplicados', async ({ page }) => {
    await simulate(page);
    await page.getByLabel('Monto del abono').fill('1000');
    await page.getByLabel('Aplicar desde el mes').fill('30');
    await page.getByRole('radio', { name: /Abono mensual/ }).check();
    await page.getByRole('radio', { name: /Reducir la cuota/ }).check();
    await page.getByRole('button', { name: 'Calcular ahorro' }).click();

    await expect(page.locator('.extra-payment-applied-note')).toContainText('abonos mensuales');
    await expect(page.locator('.extra-payment-applied-note')).toContainText('del mes 30');
    await expect(page.locator('.savings-grid')).toContainText('Cuota recalculada');
    const months = await page.locator('.extra-payment-row td:first-child').allTextContents();
    expect(Number(months[0])).toBe(30);
  });

  test('abono anual: calendario previsto antes de calcular (doble sueldo)', async ({ page }) => {
    await simulate(page);
    await page.getByLabel('Aplicar desde el mes').fill('12');
    await page.getByRole('radio', { name: /Abono anual/ }).check();
    await expect(page.locator('.plan-months')).toHaveText('Meses previstos: 12, 24, 36.');
    await expect(page.getByText('doble sueldo o bonificación anual', { exact: false })).toBeVisible();
  });

  test('comparador: la entidad con menor total se marca con texto, no solo con color', async ({ page }) => {
    await simulate(page);
    await page.getByLabel('Banco BHD').fill('10');
    const firstRow = page.locator('.comparison-table tbody tr').first();
    await expect(firstRow).toContainText('Banco BHD');
    await expect(firstRow).toContainText('Menor total simulado');
  });

  test('historial: cargar una simulación anterior actualiza el resumen y lleva al inicio', async ({ page }) => {
    await simulate(page, '300000');
    await simulate(page, '500000');
    await expect(page.locator('.payment-value')).toHaveText('RD$ 18,076.20');

    const older = page.locator('.history-load', { hasText: 'RD$ 300,000.00' });
    await older.click();
    await expect(page.locator('.summary-facts')).toContainText('RD$ 300,000.00');
    await expect(page.getByRole('heading', { level: 1, name: 'Resumen del préstamo' })).toBeFocused();
  });

  test('compartir: copia el resumen al portapapeles', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Permisos de portapapeles solo en Chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await simulate(page);
    await page.getByRole('button', { name: 'Copiar resumen' }).click();
    await expect(page.getByText('Resumen copiado al portapapeles.')).toBeVisible();
  });

  test('resultados con abonos sin desbordamiento ni violaciones WCAG graves', async ({ page }) => {
    await simulate(page);
    await page.getByLabel('Monto del abono').fill('25000');
    await page.getByRole('radio', { name: /Abono anual/ }).check();
    await page.getByRole('button', { name: 'Calcular ahorro' }).click();
    await expect(page.getByText('Intereses ahorrados')).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    expect(await seriousViolations(page)).toEqual([]);
  });
});

test.describe('UI refresh — navegación y páginas', () => {
  test('la cabecera marca la página actual y muestra etiquetas también en móvil', async ({ page }) => {
    await page.goto('/guide');
    const nav = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(nav.getByRole('link', { name: 'Guía' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByText('Calculadora', { exact: true })).toBeVisible();
  });

  for (const path of ['/guide', '/about', '/contact', '/privacy', '/terms']) {
    test(`${path} sin desbordamiento ni violaciones WCAG graves`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      expect(await seriousViolations(page)).toEqual([]);
    });
  }

  test('al cambiar de página el foco pasa al título y la vista empieza arriba', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.getByRole('contentinfo').getByRole('link', { name: 'Términos de Uso' }).click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});
