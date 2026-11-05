import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockAccountApi } from './api-mock';

const EMAIL = 'ana@example.com';
const PASSWORD = 'Seguro!2026PassWord';

test.describe('Cuenta (API simulada)', () => {
  test('protege el área privada y redirige al inicio de sesión', async ({ page }) => {
    await mockAccountApi(page);
    await page.goto('/account/security');
    await expect(page).toHaveURL(/\/account\?returnUrl=%2Faccount%2Fsecurity/);
    await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
  });

  test('registro → confirmación → login → cambio de contraseña → cerrar todas las sesiones', async ({ page }) => {
    const api = await mockAccountApi(page);

    await page.goto('/account');
    await page.getByRole('button', { name: 'Crear cuenta' }).first().click();
    await page.getByLabel('Correo electrónico').fill(EMAIL);
    await page.getByRole('textbox', { name: 'Contraseña', exact: true }).fill(PASSWORD);
    await expect(page.getByText('Al menos 12 caracteres')).toBeVisible();
    await page.getByLabel('Repite la contraseña').fill(PASSWORD);
    await page.locator('form').getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByText('Revisa tu correo')).toBeVisible();

    // Login antes de confirmar: estado comprensible y reenvío disponible.
    await page.getByLabel('Correo electrónico').fill(EMAIL);
    await page.getByRole('textbox', { name: 'Contraseña', exact: true }).fill(PASSWORD);
    await page.locator('form').getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByText('aún no está confirmada')).toBeVisible();
    await expect(page.getByText('detalle interno')).toHaveCount(0);

    // Enlace del correo: el token desaparece de la barra de direcciones.
    await page.goto('/account?action=confirm&userId=user-1&token=abc123');
    await expect(page).toHaveURL(/\/account$/);
    await page.getByRole('button', { name: 'Confirmar mi correo' }).click();
    await expect(page.getByText('Correo confirmado')).toBeVisible();

    await page.getByLabel('Correo electrónico').fill(EMAIL);
    await page.getByRole('textbox', { name: 'Contraseña', exact: true }).fill(PASSWORD);
    await page.locator('form').getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page).toHaveURL(/\/account\/security$/);
    await expect(page.getByText(EMAIL).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Mi cuenta/ })).toBeVisible();

    // El token de acceso nunca se persiste en el almacenamiento del navegador.
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(stored).not.toContain('jwt-');

    await page.getByLabel('Contraseña actual').fill(PASSWORD);
    await page.getByRole('textbox', { name: 'Nueva contraseña', exact: true }).fill('Nuevo!2026PassWord');
    await page.getByLabel('Repite la nueva contraseña').fill('Nuevo!2026PassWord');
    await page.getByRole('button', { name: 'Actualizar contraseña' }).click();
    await expect(page.getByText('Contraseña actualizada')).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar todas las sesiones' }).click();
    await page.getByRole('button', { name: 'Sí, cerrar todas' }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText('Cerraste todas tus sesiones')).toBeVisible();
    expect(api.csrfHeaders.every(header => header === '1')).toBe(true);
  });

  test('recupera la sesión al recargar usando la cookie (simulada)', async ({ page }) => {
    await mockAccountApi(page, { confirmed: true, loggedIn: true });
    await page.goto('/account/security');
    await expect(page.getByRole('heading', { name: 'Seguridad de la cuenta' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Seguridad de la cuenta' })).toBeVisible();
  });

  test('la pantalla de cuenta cumple WCAG A/AA sin violaciones graves', async ({ page }) => {
    await mockAccountApi(page);
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    const serious = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map(v => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});
