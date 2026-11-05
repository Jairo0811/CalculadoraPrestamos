import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { AccessTokenResponse, AuthService } from './auth';

const API = 'http://localhost:5000/api/v1';
const token = (value: string, minutes = 15): AccessTokenResponse => ({
  accessToken: value,
  tokenType: 'Bearer',
  expiresAtUtc: new Date(Date.now() + minutes * 60_000).toISOString()
});
const profile = { id: '7b1f', email: 'ana@example.com', emailConfirmed: true };

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()]
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => http.verify());

  function login(): void {
    auth.login('ana@example.com', 'Seguro!2026PassWord').subscribe();
    const call = http.expectOne(`${API}/auth/login`);
    expect(call.request.withCredentials).toBe(true);
    expect(call.request.headers.has('Authorization')).toBe(false);
    call.flush(token('jwt-1'));
    http.expectOne(`${API}/auth/me`).flush(profile);
  }

  it('starts unknown and keeps the access token only in memory after login', () => {
    expect(auth.status()).toBe('unknown');
    login();
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.accessToken()).toBe('jwt-1');
    expect(auth.profile()?.email).toBe('ana@example.com');
    expect(JSON.stringify({ ...localStorage })).not.toContain('jwt-1');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('jwt-1');
  });

  it('restores the session on reload using the HttpOnly cookie', () => {
    let restored: boolean | undefined;
    auth.restoreSession().subscribe(value => (restored = value));
    expect(auth.status()).toBe('restoring');

    const refresh = http.expectOne(`${API}/auth/refresh`);
    expect(refresh.request.withCredentials).toBe(true);
    expect(refresh.request.headers.get('X-LoanCalc-CSRF')).toBe('1');
    refresh.flush(token('jwt-restored'));

    const me = http.expectOne(`${API}/auth/me`);
    expect(me.request.headers.get('Authorization')).toBe('Bearer jwt-restored');
    me.flush(profile);

    expect(restored).toBe(true);
    expect(auth.status()).toBe('authenticated');
  });

  it('treats a missing or rejected cookie as an anonymous visitor without errors', () => {
    let restored: boolean | undefined;
    auth.restoreSession().subscribe(value => (restored = value));
    http.expectOne(`${API}/auth/refresh`).flush({ code: 'session_expired' }, { status: 401, statusText: 'Unauthorized' });
    expect(restored).toBe(false);
    expect(auth.status()).toBe('anonymous');
    expect(auth.sessionExpired()).toBe(false);
  });

  it('keeps the public experience working when the API is unreachable', () => {
    let restored: boolean | undefined;
    auth.restoreSession().subscribe(value => (restored = value));
    http.expectOne(`${API}/auth/refresh`).error(new ProgressEvent('error'), { status: 0 });
    expect(restored).toBe(false);
    expect(auth.status()).toBe('anonymous');
  });

  it('shares a single in-flight refresh between concurrent callers', () => {
    const results: string[] = [];
    auth.refresh().subscribe(r => results.push(r.accessToken));
    auth.refresh().subscribe(r => results.push(r.accessToken));
    auth.refresh().subscribe(r => results.push(r.accessToken));

    http.expectOne(`${API}/auth/refresh`).flush(token('jwt-shared'));
    expect(results).toEqual(['jwt-shared', 'jwt-shared', 'jwt-shared']);

    // Una vez terminada, una nueva renovación vuelve a llamar al servidor.
    auth.refresh().subscribe();
    http.expectOne(`${API}/auth/refresh`).flush(token('jwt-next'));
  });

  it('marks the session as expired when the server rejects a refresh of an active session', () => {
    login();
    let failure: unknown;
    auth.refresh().subscribe({ error: e => (failure = e) });
    http.expectOne(`${API}/auth/refresh`).flush({ code: 'session_expired' }, { status: 401, statusText: 'Unauthorized' });

    expect(failure).toBeInstanceOf(HttpErrorResponse);
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.accessToken()).toBeNull();
    expect(auth.sessionExpired()).toBe(true);
    auth.acknowledgeExpiredSession();
    expect(auth.sessionExpired()).toBe(false);
  });

  it('does not drop the session on a transient network error during refresh', () => {
    login();
    auth.refresh().subscribe({ error: () => undefined });
    http.expectOne(`${API}/auth/refresh`).error(new ProgressEvent('error'), { status: 0 });
    expect(auth.status()).toBe('authenticated');
  });

  it('considers a token about to expire as unusable', () => {
    auth.login('ana@example.com', 'x').subscribe();
    http.expectOne(`${API}/auth/login`).flush(token('jwt-short', 0.1));
    http.expectOne(`${API}/auth/me`).flush(profile);
    expect(auth.accessToken()).toBeNull();
  });

  it('logs out locally even if the server cannot be reached', () => {
    login();
    let completed = false;
    auth.logout().subscribe({ complete: () => (completed = true) });
    const call = http.expectOne(`${API}/auth/logout`);
    expect(call.request.headers.get('X-LoanCalc-CSRF')).toBe('1');
    expect(call.request.withCredentials).toBe(true);
    call.error(new ProgressEvent('error'), { status: 0 });
    expect(completed).toBe(true);
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.sessionExpired()).toBe(false);
  });

  it('revokes every session with logoutAll using bearer and anti-CSRF headers', () => {
    login();
    auth.logoutAll().subscribe();
    const call = http.expectOne(`${API}/auth/logout-all`);
    expect(call.request.headers.get('Authorization')).toBe('Bearer jwt-1');
    expect(call.request.headers.get('X-LoanCalc-CSRF')).toBe('1');
    call.flush(null, { status: 204, statusText: 'No Content' });
    expect(auth.status()).toBe('anonymous');
  });

  it('keeps the session if logoutAll fails so the user can retry', () => {
    login();
    auth.logoutAll().subscribe({ error: () => undefined });
    http.expectOne(`${API}/auth/logout-all`).flush({ code: 'too_many_requests' }, { status: 429, statusText: 'Too Many Requests' });
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('replaces the token after changing the password', () => {
    login();
    auth.changePassword('Seguro!2026PassWord', 'Nuevo!2026PassWord').subscribe();
    const call = http.expectOne(`${API}/auth/change-password`);
    expect(call.request.headers.get('Authorization')).toBe('Bearer jwt-1');
    expect(call.request.body).toEqual({ currentPassword: 'Seguro!2026PassWord', newPassword: 'Nuevo!2026PassWord' });
    call.flush(token('jwt-after-change'));
    http.expectOne(`${API}/auth/me`).flush(profile);
    expect(auth.accessToken()).toBe('jwt-after-change');
  });

  it('sends reset requests with the opaque user id instead of the email', () => {
    auth.resetPassword('user-guid', 'token-123', 'Nuevo!2026PassWord').subscribe();
    const call = http.expectOne(`${API}/auth/reset-password`);
    expect(call.request.body).toEqual({ userId: 'user-guid', token: 'token-123', newPassword: 'Nuevo!2026PassWord' });
    expect(call.request.headers.has('Authorization')).toBe(false);
    call.flush({ message: 'ok' });
  });
});
