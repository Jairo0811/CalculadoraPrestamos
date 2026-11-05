import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockAccountApi } from './api-mock';

const sample = {
  id: '00000000-0000-0000-0000-000000000001',
  userId: 'user-1', name: 'Personal ahorrado',
  loanType: 1, amount: 500000, annualRate: 18, termMonths: 36,
  isFavorite: false,
  createdAtUtc: '2026-11-01T00:00:00Z',
  updatedAtUtc: '2026-11-01T00:00:00Z'
};

test.describe('Fase 7 — simulaciones privadas (API simulada)', () => {
  test('muestra historial, favoritos, cambio de nombre y resultados', async ({ page }) => {
    const api = await mockAccountApi(page, { confirmed: true, loggedIn: true, simulations: [sample] });
    await page.goto('/account/simulations');
    await expect(page.getByRole('heading', { name: 'Mis simulaciones' })).toBeVisible();
    await expect(page.getByText('Personal ahorrado')).toBeVisible();

    await page.getByRole('button', { name: 'Añadir a favoritos' }).click();
    await expect(page.getByRole('button', { name: 'Quitar de favoritos' })).toBeVisible();

    await page.getByRole('button', { name: 'Renombrar simulación' }).click();
    await page.getByLabel('Nombre de la simulación').fill('Plan actualizado');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Plan actualizado' })).toBeVisible();

    await page.getByRole('button', { name: 'Ver resultados' }).click();
    await expect(page).toHaveURL(/\/results$/);
    await expect(page.getByRole('heading', { name: 'Resumen del préstamo' })).toBeVisible();

    expect(api.calls).toContain('GET /simulations');
    expect(api.calls).toContain('PATCH /simulations/00000000-0000-0000-0000-000000000001/favorite');
    expect(api.calls).toContain('PATCH /simulations/00000000-0000-0000-0000-000000000001/name');
  });

  test('guarda una simulación desde resultados sin enviar identificadores personales', async ({ page }) => {
    const api = await mockAccountApi(page, { confirmed: true, loggedIn: true });
    await page.goto('/calculator');
    await page.getByLabel('Monto solicitado').fill('500000');
    await page.getByLabel('Tipo de préstamo').selectOption('Personal');
    await page.getByLabel('Tasa anual').fill('18');
    await page.getByRole('button', { name: /^36 meses$/ }).click();
    await page.getByRole('button', { name: 'Calcular préstamo' }).click();
    await page.getByRole('button', { name: 'Guardar en mi cuenta' }).click();
    await page.waitForTimeout(500);
    console.log('phase7-save-diagnostic', JSON.stringify({
      calls: api.calls,
      simulations: api.simulations,
      feedback: await page.locator('.cloud-results-feedback').allTextContents(),
      button: await page.locator('.cloud-save-button').allTextContents()
    }));
    await expect(page.getByText('Guardada en tu cuenta')).toBeVisible();
    expect(api.simulations).toHaveLength(1);
    expect(JSON.stringify(api.simulations[0])).not.toContain('documentId');
    expect(JSON.stringify(api.simulations[0])).not.toContain('firstName');
    expect(JSON.stringify(api.simulations[0])).not.toContain('birthDate');
  });

  test('dashboard financiero accesible sin violaciones graves', async ({ page }) => {
    await mockAccountApi(page, { confirmed: true, loggedIn: true, simulations: [sample] });
    await page.goto('/account/simulations');
    await expect(page.getByRole('heading', { name: 'Mis simulaciones' })).toBeVisible();
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(scan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
  });
});
