import { Page, Route } from '@playwright/test';

/** API de cuentas SIMULADA en el navegador (no es el backend real). */
export const API = 'http://localhost:5000/api/v1';

export interface MockLoanSimulation {
  id: string;
  userId: string;
  name: string;
  loanType: number;
  amount: number;
  annualRate: number;
  termMonths: number;
  isFavorite: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface MockState {
  confirmed: boolean;
  loggedIn: boolean;
  password: string;
  calls: string[];
  csrfHeaders: (string | undefined)[];
  simulations: MockLoanSimulation[];
}

const accessToken = (value: string) => ({
  accessToken: value,
  tokenType: 'Bearer',
  expiresAtUtc: new Date(Date.now() + 15 * 60_000).toISOString()
});

const problem = (route: Route, status: number, code: string) =>
  route.fulfill({ status, contentType: 'application/problem+json', body: JSON.stringify({ status, code, detail: 'detalle interno' }) });

export async function mockAccountApi(page: Page, initial: Partial<MockState> = {}): Promise<MockState> {
  const state: MockState = { confirmed: false, loggedIn: false, password: 'Seguro!2026PassWord', calls: [], csrfHeaders: [], simulations: [], ...initial };

  await page.route(`${API}/**`, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const body = request.postDataJSON?.() ?? {};
    state.calls.push(`${request.method()} ${path}`);

    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });

    // Simula los endpoints privados existentes; la autenticación real y la base de datos
    // PostgreSQL se prueban por separado con xUnit en el backend.
    if (path === '/simulations' || path.startsWith('/simulations/')) {
      if (!state.loggedIn) return problem(route, 401, 'session_expired');
      const parts = path.split('/').filter(Boolean);
      const id = parts[1];
      const current = state.simulations.find(item => item.id === id);
      const timestamp = new Date().toISOString();
      if (path === '/simulations' && request.method() === 'GET')
        return route.fulfill({ json: state.simulations });
      if (path === '/simulations' && request.method() === 'POST') {
        const item: MockLoanSimulation = {
          id: '00000000-0000-0000-0000-' + String(state.simulations.length + 1).padStart(12, '0'),
          userId: 'user-1', name: body.name, loanType: body.loanType,
          amount: body.amount, annualRate: body.annualRate, termMonths: body.termMonths,
          isFavorite: false, createdAtUtc: timestamp, updatedAtUtc: timestamp
        };
        state.simulations.push(item);
        return route.fulfill({ status: 201, json: item });
      }
      if (!current) return problem(route, 404, 'not_found');
      if (parts.length === 2 && request.method() === 'GET')
        return route.fulfill({ json: current });
      if (parts.length === 2 && request.method() === 'DELETE') {
        state.simulations.splice(state.simulations.indexOf(current), 1);
        return route.fulfill({ status: 204 });
      }
      if (parts.length === 3 && request.method() === 'PATCH') {
        if (parts[2] === 'name') current.name = body.name;
        else if (parts[2] === 'favorite') current.isFavorite = body.isFavorite;
        else return problem(route, 404, 'not_found');
        current.updatedAtUtc = timestamp;
        return route.fulfill({ json: current });
      }
      return problem(route, 404, 'not_found');
    }


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
