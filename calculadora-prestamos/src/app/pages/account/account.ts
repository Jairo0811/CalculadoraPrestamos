import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth';

type AccountMode = 'login' | 'register' | 'forgot' | 'confirm' | 'reset';

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

  email = '';
  password = '';
  userId = '';
  token = '';
  mode: AccountMode = 'login';
  busy = false;
  error = '';
  notice = '';

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const action = params.get('action');
    if (action === 'confirm' || action === 'reset') {
      this.mode = action;
      this.token = params.get('token') ?? '';
      this.userId = params.get('userId') ?? '';
      this.email = params.get('email') ?? '';
      // No mantener tokens de recuperación en la URL o historial del navegador.
      void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    }
    this.auth.refresh().subscribe({ error: () => { /* Las cuentas anónimas son válidas. */ } });
  }

  submit(): void {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    this.notice = '';

    if (this.mode === 'confirm') {
      this.auth.confirmEmail(this.userId, this.token).pipe(finalize(() => this.busy = false))
        .subscribe({
          next: () => { this.clearSensitive(); this.mode = 'login'; this.notice = 'Correo confirmado. Ya puedes iniciar sesión.'; },
          error: () => { this.error = 'El enlace de confirmación es inválido o ha expirado.'; }
        });
      return;
    }

    if (this.mode === 'reset') {
      this.auth.resetPassword(this.email.trim(), this.token, this.password)
        .pipe(finalize(() => this.busy = false))
        .subscribe({
          next: () => { this.clearSensitive(); this.mode = 'login'; this.notice = 'Contraseña cambiada. Inicia sesión nuevamente.'; },
          error: () => { this.clearSensitive(); this.mode = 'forgot'; this.error = 'No fue posible restablecer tu contraseña. Solicita un enlace nuevo.'; }
        });
      return;
    }

    if (this.mode === 'forgot') {
      this.auth.forgotPassword(this.email.trim()).pipe(finalize(() => this.busy = false))
        .subscribe({
          next: () => { this.mode = 'login'; this.notice = 'Si la cuenta existe, recibirás instrucciones de recuperación.'; },
          error: () => { this.error = 'No pudimos procesar la solicitud. Comprueba la configuración de correo.'; }
        });
      return;
    }

    if (this.mode === 'register') {
      this.auth.register(this.email.trim(), this.password)
        .pipe(finalize(() => { this.busy = false; }))
        .subscribe({
          next: () => {
            this.mode = 'login';
            this.password = '';
            this.notice = 'Revisa tu correo y confirma la cuenta antes de iniciar sesión.';
          },
          error: () => {
            this.password = '';
            this.error = 'No se pudo crear la cuenta. Revisa la contraseña o el servicio de correo.';
          }
        });
      return;
    }

    this.auth.login(this.email.trim(), this.password)
      .pipe(finalize(() => { this.busy = false; }))
      .subscribe({
        next: () => { this.password = ''; this.notice = 'Sesión iniciada correctamente.'; },
        error: () => {
          this.password = '';
          this.error = 'No se pudo iniciar sesión. Comprueba tus credenciales y la confirmación del correo.';
        }
      });
  }

  resend(): void {
    if (this.busy || !this.email.trim()) return;
    this.busy = true;
    this.auth.resendConfirmation(this.email.trim()).pipe(finalize(() => this.busy = false))
      .subscribe({
        next: () => { this.notice = 'Si corresponde, recibirás otro correo de confirmación.'; },
        error: () => { this.error = 'No se pudo solicitar la confirmación.'; }
      });
  }

  setMode(mode: AccountMode): void {
    this.mode = mode;
    this.password = '';
    this.error = '';
    this.notice = '';
  }

  logout(): void {
    this.busy = true;
    this.auth.logout().pipe(finalize(() => { this.busy = false; }))
      .subscribe({
        next: () => { this.notice = 'Sesión revocada en el servidor.'; },
        error: () => { this.error = 'No se pudo confirmar el cierre en el servidor. Comprueba la API.'; }
      });
  }

  logoutAll(): void {
    this.busy = true;
    this.auth.logoutAll().pipe(finalize(() => { this.busy = false; }))
      .subscribe({
        next: () => { this.notice = 'Todas las sesiones de tu cuenta fueron revocadas.'; },
        error: () => { this.error = 'No se pudieron revocar todas las sesiones. Comprueba la API.'; }
      });
  }

  private clearSensitive(): void {
    this.token = '';
    this.userId = '';
    this.password = '';
  }
}
