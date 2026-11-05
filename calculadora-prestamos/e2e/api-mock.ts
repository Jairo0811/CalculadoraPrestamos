import { Page, Route } from '@playwright/test';

/** API de cuentas SIMULADA en el navegador (no es el backend real). */
export const API = 'http://localhost:5000/api/v1';

export interface MockState {
  confirmed: boolean;
  loggedIn: boolean;
  password: string;
  calls: string[];
  csrfHeaders: (string | undefined)[];
}

const accessToken = (value: string) => ({
  accessToken: value,
  tokenType: 'Bearer',
  expiresAtUtc: new Date(Date.now() + 15 * 60_000).toISOString()
});

const problem = (route: Route, status: number, code: string) =>
  route.fulfill({ status, contentType: 'application/problem+json', body: JSON.stringify({ status, code, detail: 'detalle interno' }) });

export async function mockAccountApi(page: Page, initial: Partial<MockState> = {}): Promise<MockState> {
  const state: MockState = { confirmed: false, loggedIn: false, password: 'Seguro!2026PassWord', calls: [], csrfHeaders: [], ...initial };

  await page.route(`${API}/**`, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const body = request.postDataJSON?.() ?? {};
    state.calls.push(`${request.method()} ${path}`);

    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });

    switch (path) {
      case '/auth/refresh':
        state.csrfHeaders.push(request.headers()['x-loancalc-csrf']);
        return state.loggedIn ? route.fulfill({ json: accessToken('jwt-refreshed') }) : problem(route, 401, 'session_expired');
      case '/auth/register':
        return route.fulfill({ status: 202, json: { message: 'ok' } });
      case '/auth/resend-confirmation':
      case '/auth/forgot-password':
        return route.fulfill({ status: 202, json: { message: 'ok' } });
      case '/auth/confirm-email':
        state.confirmed = true;
        return route.fulfill({ json: { message: 'ok' } });
      case '/auth/login':
        if (body.password !== state.password) return problem(route, 401, 'invalid_credentials');
        if (!state.confirmed) return problem(route, 403, 'email_not_confirmed');
        state.loggedIn = true;
        return route.fulfill({ json: accessToken('jwt-login') });
      case '/auth/me': {
        const auth = request.headers()['authorization'];
        return state.loggedIn && auth?.startsWith('Bearer ')
          ? route.fulfill({ json: { id: 'user-1', email: 'ana@example.com', emailConfirmed: true } })
          : problem(route, 401, 'session_expired');
      }
      case '/auth/change-password':
        if (body.currentPassword !== state.password) return problem(route, 400, 'invalid_current_password');
        state.password = body.newPassword;
        return route.fulfill({ json: accessToken('jwt-changed') });
      case '/auth/logout':
      case '/auth/logout-all':
        state.csrfHeaders.push(request.headers()['x-loancalc-csrf']);
        state.loggedIn = false;
        return route.fulfill({ status: 204 });
      default:
        return problem(route, 404, 'not_found');
    }
  });

  return state;
}
