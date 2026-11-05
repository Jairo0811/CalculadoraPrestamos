import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../services/auth';
import { apiPath, authInterceptor } from './auth.interceptor';

const API = 'http://localhost:5000/api/v1';
const tokenResponse = (accessToken: string) => ({
  accessToken,
  tokenType: 'Bearer',
  expiresAtUtc: new Date(Date.now() + 15 * 60_000).toISOString()
});

describe('authInterceptor', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  let auth: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => http.verify());

  function signIn(token = 'jwt-1'): void {
    auth.login('ana@example.com', 'x').subscribe();
    http.expectOne(`${API}/auth/login`).flush(tokenResponse(token));
    http.expectOne(`${API}/auth/me`).flush({ id: '1', email: 'ana@example.com', emailConfirmed: true });
  }

  it('attaches the bearer token only to the configured API', () => {
    signIn();
    client.get(`${API}/simulations`).subscribe();
    client.get('https://cdn.example.com/data.json').subscribe();
    client.get('http://localhost:5000/api/v1-evil/simulations').subscribe();

    expect(http.expectOne(`${API}/simulations`).request.headers.get('Authorization')).toBe('Bearer jwt-1');
    expect(http.expectOne('https://cdn.example.com/data.json').request.headers.has('Authorization')).toBe(false);
    expect(http.expectOne('http://localhost:5000/api/v1-evil/simulations').request.headers.has('Authorization')).toBe(false);
  });

  it('refreshes once on 401 and retries the original request with the new token', () => {
    signIn('jwt-old');
    let body: unknown;
    client.get(`${API}/simulations`).subscribe(value => (body = value));

    http.expectOne(`${API}/simulations`).flush({ code: 'session_expired' }, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${API}/auth/refresh`).flush(tokenResponse('jwt-new'));
    const retry = http.expectOne(`${API}/simulations`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer jwt-new');
    retry.flush([{ id: 'a' }]);

    expect(body).toEqual([{ id: 'a' }]);
  });

  it('shares one refresh between parallel 401 responses', () => {
    signIn('jwt-old');
    client.get(`${API}/simulations`).subscribe();
    client.get(`${API}/auth/me`).subscribe();

    http.expectOne(`${API}/simulations`).flush(null, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${API}/auth/me`).flush(null, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${API}/auth/refresh`).flush(tokenResponse('jwt-new'));

    http.expectOne(`${API}/simulations`).flush([]);
    http.expectOne(`${API}/auth/me`).flush({ id: '1', email: 'ana@example.com', emailConfirmed: true });
  });

  it('never loops: a second 401 after refreshing ends the session', () => {
    signIn('jwt-old');
    let status: number | undefined;
    client.get(`${API}/simulations`).subscribe({ error: e => (status = e.status) });

    http.expectOne(`${API}/simulations`).flush(null, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${API}/auth/refresh`).flush(tokenResponse('jwt-new'));
    http.expectOne(`${API}/simulations`).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.sessionExpired()).toBe(true);
  });

  it('propagates the original 401 when the refresh itself is rejected', () => {
    signIn('jwt-old');
    let status: number | undefined;
    client.get(`${API}/simulations`).subscribe({ error: e => (status = e.status) });
    http.expectOne(`${API}/simulations`).flush(null, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${API}/auth/refresh`).flush({ code: 'session_expired' }, { status: 401, statusText: 'Unauthorized' });
    expect(status).toBe(401);
    expect(auth.status()).toBe('anonymous');
  });

  it('does not try to refresh after failed credentials, 403 or 429', () => {
    auth.login('ana@example.com', 'mala').subscribe({ error: () => undefined });
    http.expectOne(`${API}/auth/login`).flush({ code: 'invalid_credentials' }, { status: 401, statusText: 'Unauthorized' });

    signIn();
    client.get(`${API}/simulations`).subscribe({ error: () => undefined });
    http.expectOne(`${API}/simulations`).flush(null, { status: 403, statusText: 'Forbidden' });
    client.get(`${API}/simulations`).subscribe({ error: () => undefined });
    http.expectOne(`${API}/simulations`).flush(null, { status: 429, statusText: 'Too Many Requests' });
    http.expectNone(`${API}/auth/refresh`);
  });

  it('adds credentials and the anti-CSRF header only where the cookie is used', () => {
    client.post(`${API}/auth/register`, {}).subscribe();
    const register = http.expectOne(`${API}/auth/register`);
    expect(register.request.withCredentials).toBe(true);
    expect(register.request.headers.has('X-LoanCalc-CSRF')).toBe(false);
    register.flush({});

    signIn();
    client.get(`${API}/simulations`).subscribe();
    const simulations = http.expectOne(`${API}/simulations`);
    expect(simulations.request.withCredentials).toBe(false);
    simulations.flush([]);
  });
});

describe('apiPath', () => {
  it('returns the API-relative path or null for foreign URLs', () => {
    expect(apiPath('http://localhost:5000/api/v1/auth/login', 'http://localhost:5000/api/v1')).toBe('/auth/login');
    expect(apiPath('/api/v1/simulations?page=2', '/api/v1')).toBe('/simulations');
    expect(apiPath('/api/v1', '/api/v1')).toBe('/');
    expect(apiPath('/api/v10/simulations', '/api/v1')).toBeNull();
    expect(apiPath('https://evil.example/api/v1/auth/me', '/api/v1')).toBeNull();
  });
});
