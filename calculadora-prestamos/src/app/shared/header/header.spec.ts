import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { APP_CONFIG } from '../../core/config/app-config';
import { AuthService } from '../../core/services/auth';
import { Header } from './header';

describe('Header', () => {
  function setup(accounts: boolean) {
    TestBed.configureTestingModule({
      imports: [Header],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { production: false, apiBaseUrl: '/api/v1', features: { accounts } } }
      ]
    });
    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();
    return fixture;
  }

  it('muestra el isotipo oficial en la cabecera', () => {
    const fixture = setup(false);
    const logo = fixture.nativeElement.querySelector('.brand-isotipo') as HTMLImageElement;
    expect(logo).toBeTruthy();
    expect(logo.getAttribute('src')).toBe('/assets/img/isotipo-loancalc-rd-256.webp');
    expect(logo.getAttribute('alt')).toBe('');
    expect(fixture.nativeElement.querySelector('.brand-name')?.textContent).toContain('LoanCalc');
  });

  it('hides account links when accounts are disabled for the environment', () => {
    const fixture = setup(false);
    expect(fixture.nativeElement.textContent).not.toContain('Iniciar sesión');
    expect(fixture.nativeElement.textContent).toContain('Calculadora');
  });

  it('shows the signed-in state after login', () => {
    const fixture = setup(true);
    expect(fixture.nativeElement.textContent).toContain('Iniciar sesión');

    const auth = TestBed.inject(AuthService);
    const http = TestBed.inject(HttpTestingController);
    auth.login('ana@example.com', 'x').subscribe();
    http.expectOne('/api/v1/auth/login').flush({ accessToken: 'jwt', tokenType: 'Bearer', expiresAtUtc: new Date(Date.now() + 9e5).toISOString() });
    http.expectOne('/api/v1/auth/me').flush({ id: '1', email: 'ana@example.com', emailConfirmed: true });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Mi cuenta');
    expect(fixture.nativeElement.textContent).toContain('ana@example.com');
  });
});
