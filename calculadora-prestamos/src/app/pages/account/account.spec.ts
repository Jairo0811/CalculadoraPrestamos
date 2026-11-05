import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { authInterceptor } from '../../core/interceptors/auth.interceptor';
import { Account } from './account';

const API = 'http://localhost:5000/api/v1';

describe('Account', () => {
  let fixture: ComponentFixture<Account>;
  let component: Account;
  let http: HttpTestingController;
  let navigateByUrl: ReturnType<typeof vi.fn>;

  function create(query: Record<string, string> = {}) {
    TestBed.configureTestingModule({
      imports: [Account],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } }
      ]
    });
    const router = TestBed.inject(Router);
    navigateByUrl = vi.fn().mockResolvedValue(true);
    router.navigateByUrl = navigateByUrl as unknown as Router['navigateByUrl'];
    router.navigate = vi.fn().mockResolvedValue(true) as unknown as Router['navigate'];
    fixture = TestBed.createComponent(Account);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  const form = { invalid: false } as never;
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  afterEach(() => http.verify());

  it('validates fields on the client before calling the API', () => {
    create();
    component.setMode('register');
    component.email = 'no-es-correo';
    component.password = 'corta';
    component.confirmPassword = 'otra';
    component.submit(form);
    fixture.detectChanges();

    expect(component.fieldInvalid('email')).toBe(true);
    expect(component.fieldInvalid('password')).toBe(true);
    expect(component.fieldInvalid('confirm')).toBe(true);
    expect(text()).toContain('Introduce un correo electrónico válido');
    expect(text()).toContain('Las contraseñas no coinciden');
    http.expectNone(`${API}/auth/register`);
  });

  it('logs in and navigates to the safe return URL', () => {
    create({ returnUrl: 'https://evil.example' });
    component.email = 'ana@example.com';
    component.password = 'Seguro!2026PassWord';
    component.submit(form);

    http.expectOne(`${API}/auth/login`).flush({ accessToken: 'jwt', tokenType: 'Bearer', expiresAtUtc: new Date(Date.now() + 9e5).toISOString() });
    http.expectOne(`${API}/auth/me`).flush({ id: '1', email: 'ana@example.com', emailConfirmed: true });

    expect(navigateByUrl).toHaveBeenCalledWith('/account/security');
    expect(component.password).toBe('');
  });

  it('explains wrong credentials without technical details', () => {
    create();
    component.email = 'ana@example.com';
    component.password = 'Incorrecta';
    component.submit(form);
    http.expectOne(`${API}/auth/login`).flush({ code: 'invalid_credentials', detail: 'internal' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(text()).toContain('Correo o contraseña incorrectos');
    expect(text()).not.toContain('internal');
    expect(component.password).toBe('');
  });

  it('offers to resend the confirmation for unconfirmed accounts', () => {
    create();
    component.email = 'ana@example.com';
    component.password = 'Seguro!2026PassWord';
    component.submit(form);
    http.expectOne(`${API}/auth/login`).flush({ code: 'email_not_confirmed' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(text()).toContain('aún no está confirmada');

    component.resendConfirmation();
    const resend = http.expectOne(`${API}/auth/resend-confirmation`);
    expect(resend.request.body).toEqual({ email: 'ana@example.com' });
    resend.flush({ message: 'ok' }, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();
    expect(text()).toContain('Enlace reenviado');
  });

  it('shows a clear message when too many attempts are made', () => {
    create();
    component.email = 'ana@example.com';
    component.password = 'x';
    component.submit(form);
    http.expectOne(`${API}/auth/login`).flush({ code: 'too_many_requests' }, { status: 429, statusText: 'Too Many Requests' });
    fixture.detectChanges();
    expect(text()).toContain('Demasiados intentos');
  });

  it('confirms the email from the link and removes the token from the URL', () => {
    create({ action: 'confirm', userId: 'user-1', token: 'abc' });
    expect(component.mode()).toBe('confirm');
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: {}, replaceUrl: true }));

    component.submit(form);
    const confirm = http.expectOne(`${API}/auth/confirm-email`);
    expect(confirm.request.body).toEqual({ userId: 'user-1', token: 'abc' });
    confirm.flush({ message: 'ok' });
    fixture.detectChanges();

    expect(component.mode()).toBe('login');
    expect(text()).toContain('Correo confirmado');
  });

  it('sends the user to request a new link when a reset link expired', () => {
    create({ action: 'reset', userId: 'user-1', token: 'abc' });
    component.password = 'Nuevo!2026PassWord';
    component.confirmPassword = 'Nuevo!2026PassWord';
    component.submit(form);
    http.expectOne(`${API}/auth/reset-password`).flush({ code: 'invalid_link' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(component.mode()).toBe('forgot');
    expect(text()).toContain('ha expirado');
  });

  it('confirms that the recovery email was sent without revealing if the account exists', () => {
    create();
    component.setMode('forgot');
    component.email = 'nadie@example.com';
    component.submit(form);
    http.expectOne(`${API}/auth/forgot-password`).flush({ message: 'ok' }, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();
    expect(text()).toContain('Si existe una cuenta');
  });

  it('reports when the email service is unavailable', () => {
    create();
    component.setMode('register');
    component.email = 'ana@example.com';
    component.password = component.confirmPassword = 'Seguro!2026PassWord';
    component.submit(form);
    http.expectOne(`${API}/auth/register`).flush({ code: 'email_unavailable' }, { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();
    expect(text()).toContain('servicio de correo no está disponible');
  });
});
