import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { safeReturnUrl } from '../../core/guards/auth.guard';
import { ApiErrorInfo, describeApiError } from '../../core/services/api-errors';
import { AuthService } from '../../core/services/auth';
import { evaluatePassword, isValidEmail, meetsPasswordPolicy } from '../../core/validators/password-policy';

export type AccountMode = 'login' | 'register' | 'forgot' | 'confirm' | 'reset';

interface Notice {
  tone: 'success' | 'info' | 'warning';
  icon: string;
  title: string;
  text: string;
  action?: 'resend';
}

const HEADINGS: Record<AccountMode, { title: string; subtitle: string; submit: string; busy: string }> = {
  login: { title: 'Inicia sesión', subtitle: 'Accede a tu cuenta de LoanCalc RD.', submit: 'Iniciar sesión', busy: 'Verificando…' },
  register: { title: 'Crea tu cuenta', subtitle: 'Solo necesitas un correo y una contraseña segura.', submit: 'Crear cuenta', busy: 'Creando cuenta…' },
  forgot: { title: 'Recupera tu acceso', subtitle: 'Te enviaremos un enlace temporal para crear una contraseña nueva.', submit: 'Enviar enlace', busy: 'Enviando…' },
  confirm: { title: 'Confirma tu correo', subtitle: 'Un último paso para activar tu cuenta.', submit: 'Confirmar mi correo', busy: 'Confirmando…' },
  reset: { title: 'Crea una contraseña nueva', subtitle: 'Al guardarla se cerrarán todas tus sesiones abiertas.', submit: 'Guardar contraseña', busy: 'Guardando…' }
};

@Component({
  selector: 'app-account',
  imports: [FormsModule, RouterLink],
  templateUrl: './account.html',
  styleUrl: './account.css'
})
export class Account implements OnInit {
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  readonly mode = signal<AccountMode>('login');
  readonly busy = signal(false);
  readonly error = signal<ApiErrorInfo | null>(null);
  readonly notice = signal<Notice | null>(null);
  readonly showPassword = signal(false);
  readonly copy = computed(() => HEADINGS[this.mode()]);

  email = '';
  password = '';
  confirmPassword = '';
  submitted = false;

  private userId = '';
  private token = '';
  private returnUrl = '/account/security';
  private pendingEmail = '';

  readonly isValidEmail = isValidEmail;

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.returnUrl = safeReturnUrl(params.get('returnUrl'));

    const action = params.get('action');
    if (action === 'confirm' || action === 'reset') {
      this.userId = params.get('userId') ?? '';
      this.token = params.get('token') ?? '';
      this.mode.set(this.userId && this.token ? action : 'login');
      if (!this.userId || !this.token) {
        this.error.set({ ...describeApiError(null), kind: 'invalid-link', message: 'El enlace está incompleto. Ábrelo de nuevo desde tu correo o solicita uno nuevo.' });
      }
    } else if (params.get('mode') === 'register') {
      this.mode.set('register');
    }

    const signedOut = params.get('signedOut');
    if (signedOut) {
      this.notice.set({
        tone: 'success', icon: 'bi-box-arrow-right',
        title: signedOut === 'all' ? 'Cerraste todas tus sesiones' : 'Sesión cerrada',
        text: signedOut === 'all'
          ? 'Se revocó el acceso en todos tus dispositivos.'
          : 'Tu sesión se cerró en este dispositivo y fue revocada en el servidor.'
      });
    } else if (this.auth.sessionExpired()) {
      this.notice.set({ tone: 'warning', icon: 'bi-clock-history', title: 'Tu sesión expiró', text: 'Por seguridad, inicia sesión nuevamente para continuar.' });
      this.auth.acknowledgeExpiredSession();
    }

    // Los tokens de un solo uso no deben quedar en la barra de direcciones ni en el historial.
    if (action || signedOut) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    }
  }

  setMode(mode: AccountMode): void {
    this.mode.set(mode);
    this.password = '';
    this.confirmPassword = '';
    this.submitted = false;
    this.error.set(null);
    this.notice.set(null);
    this.showPassword.set(false);
    setTimeout(() => this.heading()?.nativeElement.focus());
  }

  passwordChecks() {
    return evaluatePassword(this.password);
  }

  needsNewPassword(): boolean {
    return this.mode() === 'register' || this.mode() === 'reset';
  }

  passwordsMatch(): boolean {
    return this.password === this.confirmPassword;
  }

  submit(form: NgForm): void {
    if (this.busy()) return;
    this.submitted = true;
    this.error.set(null);

    if (!this.isFormValid() || form.invalid) {
      setTimeout(() => document.querySelector<HTMLElement>('.account-form [aria-invalid="true"]')?.focus());
      return;
    }

    this.notice.set(null);
    this.busy.set(true);
    const email = this.email.trim();
    const done = finalize(() => this.busy.set(false));

    switch (this.mode()) {
      case 'login':
        this.auth.login(email, this.password).pipe(done).subscribe({
          next: () => {
            this.password = '';
            void this.router.navigateByUrl(this.returnUrl);
          },
          error: error => {
            this.password = '';
            this.pendingEmail = email;
            this.fail(error);
          }
        });
        return;

      case 'register':
        this.auth.register(email, this.password).pipe(done).subscribe({
          next: () => {
            this.pendingEmail = email;
            this.setMode('login');
            this.notice.set({
              tone: 'success', icon: 'bi-envelope-check', title: 'Revisa tu correo',
              text: `Si ${email} puede registrarse, recibirás un enlace para confirmar la cuenta. Caduca en 2 horas.`,
              action: 'resend'
            });
          },
          error: error => this.fail(error)
        });
        return;

      case 'forgot':
        this.auth.forgotPassword(email).pipe(done).subscribe({
          next: () => {
            this.setMode('login');
            this.notice.set({
              tone: 'info', icon: 'bi-envelope-paper', title: 'Correo enviado',
              text: 'Si existe una cuenta con ese correo, recibirás un enlace temporal para restablecer la contraseña.'
            });
          },
          error: error => this.fail(error)
        });
        return;

      case 'confirm':
        this.auth.confirmEmail(this.userId, this.token).pipe(done).subscribe({
          next: () => {
            this.clearLinkTokens();
            this.setMode('login');
            this.notice.set({ tone: 'success', icon: 'bi-patch-check', title: 'Correo confirmado', text: 'Tu cuenta está activa. Ya puedes iniciar sesión.' });
          },
          error: error => this.fail(error)
        });
        return;

      case 'reset':
        this.auth.resetPassword(this.userId, this.token, this.password).pipe(done).subscribe({
          next: () => {
            this.clearLinkTokens();
            this.setMode('login');
            this.notice.set({ tone: 'success', icon: 'bi-shield-check', title: 'Contraseña actualizada', text: 'Cerramos tus sesiones anteriores. Inicia sesión con tu nueva contraseña.' });
          },
          error: error => {
            this.password = '';
            this.confirmPassword = '';
            this.fail(error);
          }
        });
        return;
    }
  }

  resendConfirmation(): void {
    const email = (this.pendingEmail || this.email).trim();
    if (this.busy() || !isValidEmail(email)) return;
    this.busy.set(true);
    this.error.set(null);
    this.auth.resendConfirmation(email).pipe(finalize(() => this.busy.set(false))).subscribe({
      next: () => this.notice.set({
        tone: 'info', icon: 'bi-envelope-arrow-up', title: 'Enlace reenviado',
        text: 'Si la cuenta está pendiente de confirmar, recibirás un nuevo enlace en unos minutos.'
      }),
      error: error => this.fail(error)
    });
  }

  logout(): void {
    this.busy.set(true);
    this.auth.logout().pipe(finalize(() => this.busy.set(false))).subscribe(() => {
      this.notice.set({ tone: 'success', icon: 'bi-box-arrow-right', title: 'Sesión cerrada', text: 'Tu sesión se cerró en este dispositivo.' });
    });
  }

  fieldInvalid(field: 'email' | 'password' | 'confirm'): boolean {
    if (!this.submitted) return false;
    switch (field) {
      case 'email': return this.mode() !== 'confirm' && this.mode() !== 'reset' && !isValidEmail(this.email);
      case 'password':
        return this.mode() === 'login'
          ? this.password.length === 0
          : this.needsNewPassword() && !meetsPasswordPolicy(this.password);
      case 'confirm': return this.needsNewPassword() && !this.passwordsMatch();
    }
  }

  private isFormValid(): boolean {
    return !this.fieldInvalid('email') && !this.fieldInvalid('password') && !this.fieldInvalid('confirm');
  }

  private fail(error: unknown): void {
    const info = describeApiError(error);
    this.error.set(info);
    if (info.kind === 'invalid-link' && (this.mode() === 'confirm' || this.mode() === 'reset')) {
      const wasReset = this.mode() === 'reset';
      this.clearLinkTokens();
      this.mode.set(wasReset ? 'forgot' : 'login');
    }
  }

  private clearLinkTokens(): void {
    this.userId = '';
    this.token = '';
  }
}
