import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { API } from './api-mock';

test.describe('Calculadora pública (sin cuenta)', () => {
  test('simula un préstamo solo con datos financieros, aun sin backend disponible', async ({ page }) => {
    // La API no responde: la experiencia pública debe seguir funcionando.
    await page.route(`${API}/**`, route => route.abort('connectionrefused'));

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('costo real');
    await page.getByRole('link', { name: 'Comenzar simulación' }).click();

    await expect(page).toHaveURL(/\/calculator$/);
    await page.getByLabel('Monto solicitado').fill('500000');
    await page.getByLabel('Tipo de préstamo').selectOption('Personal');
    await page.getByLabel('Tasa anual').fill('18');
    await page.getByRole('button', { name: /^36 meses$/ }).click();
    await page.getByRole('button', { name: 'Calcular préstamo' }).click();

    await expect(page).toHaveURL(/\/results$/);
    await expect(page.getByText('RD$ 18,076.20').first()).toBeVisible();
    await expect(page.getByText(/no constituyen asesoría financiera personalizada/)).toBeVisible();
  });

  test('muestra errores contextuales y enfoca el primer campo inválido', async ({ page }) => {
    await page.goto('/calculator');
    await page.getByRole('button', { name: 'Calcular préstamo' }).click();

    await expect(page.getByText('Indica el monto que deseas financiar.')).toBeVisible();
    await expect(page.getByText('Selecciona el tipo de préstamo.')).toBeVisible();
    await expect(page.getByLabel('Monto solicitado')).toBeFocused();
    await expect(page.getByLabel('Monto solicitado')).toHaveAttribute('aria-invalid', 'true');
  });

  test('el enlace "Saltar al contenido" enfoca el contenido sin salir de la página', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Navegación por teclado verificada en escritorio');
    await page.goto('/calculator');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Saltar al contenido principal' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/calculator$/);
    await expect(page.locator('#main-content')).toBeFocused();
  });

  for (const path of ['/', '/calculator']) {
    test(`sin desplazamiento horizontal ni violaciones WCAG A/AA graves en ${path}`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);

      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      const serious = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
      expect(serious.map(v => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
  }
});
