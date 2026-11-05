import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Observable, firstValueFrom, isObservable } from 'rxjs';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { APP_CONFIG } from '../config/app-config';
import { accountsEnabledGuard, authGuard, safeReturnUrl } from './auth.guard';

const API = 'http://localhost:5000/api/v1';

describe('authGuard', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const run = () => TestBed.runInInjectionContext(() =>
    authGuard({} as ActivatedRouteSnapshot, { url: '/account/security' } as RouterStateSnapshot));

  it('redirects anonymous visitors to the login page keeping the return URL', async () => {
    const result = run();
    expect(isObservable(result)).toBe(true);
    const pending = firstValueFrom(result as Observable<boolean | UrlTree>);
    http.expectOne(`${API}/auth/refresh`).flush(null, { status: 401, statusText: 'Unauthorized' });
    const tree = await pending;
    expect(tree).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(tree as UrlTree)).toBe('/account?returnUrl=%2Faccount%2Fsecurity');
  });

  it('allows navigation once the session is restored', async () => {
    const pending = firstValueFrom(run() as Observable<boolean | UrlTree>);
    http.expectOne(`${API}/auth/refresh`).flush({ accessToken: 'jwt', tokenType: 'Bearer', expiresAtUtc: new Date(Date.now() + 9e5).toISOString() });
    http.expectOne(`${API}/auth/me`).flush({ id: '1', email: 'ana@example.com', emailConfirmed: true });
    expect(await pending).toBe(true);
  });
});

describe('accountsEnabledGuard', () => {
  it('follows the environment feature flag', () => {
    for (const enabled of [true, false]) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: APP_CONFIG, useValue: { production: false, apiBaseUrl: '/api/v1', features: { accounts: enabled } } }]
      });
      expect(TestBed.runInInjectionContext(() => accountsEnabledGuard({} as never, []))).toBe(enabled);
    }
  });
});

describe('safeReturnUrl', () => {
  it('only accepts internal paths to prevent open redirects', () => {
    expect(safeReturnUrl('/results')).toBe('/results');
    expect(safeReturnUrl('/account/security')).toBe('/account/security');
    expect(safeReturnUrl('https://evil.example')).toBe('/account/security');
    expect(safeReturnUrl('//evil.example')).toBe('/account/security');
    expect(safeReturnUrl('/\\evil.example')).toBe('/account/security');
    expect(safeReturnUrl('/account')).toBe('/account/security');
    expect(safeReturnUrl(null)).toBe('/account/security');
  });
});
