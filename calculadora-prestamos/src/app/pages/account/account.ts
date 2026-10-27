import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth';

@Component({
  selector: 'app-account',
  imports: [FormsModule, RouterLink],
  templateUrl: './account.html',
  styleUrl: './account.css'
})
export class Account {
  readonly auth = inject(AuthService);

  email = '';
  password = '';
  mode: 'login' | 'register' = 'login';
  busy = false;
  error = '';
  notice = '';

  submit(): void {
    if (this.busy || !this.email.trim() || !this.password) return;

    this.busy = true;
    this.error = '';
    this.notice = '';

    if (this.mode === 'register') {
      this.auth.register(this.email.trim(), this.password)
        .pipe(finalize(() => { this.busy = false; }))
        .subscribe({
          next: () => {
            this.mode = 'login';
            this.password = '';
            this.notice = 'Cuenta creada. Inicia sesión con tu nueva contraseña.';
          },
          error: () => { this.error = 'No se pudo crear la cuenta. Verifica el correo y los requisitos de contraseña.'; }
        });
      return;
    }

    this.auth.login(this.email.trim(), this.password)
      .pipe(finalize(() => { this.busy = false; }))
      .subscribe({
        next: () => {
          this.password = '';
          this.notice = 'Sesión iniciada. Ya puedes consultar tus simulaciones privadas desde la API.';
        },
        error: () => {
          this.password = '';
          this.error = 'No se pudo iniciar sesión. Comprueba las credenciales o el estado de la API local.';
        }
      });
  }

  switchMode(): void {
    this.mode = this.mode === 'login' ? 'register' : 'login';
    this.password = '';
    this.error = '';
    this.notice = '';
  }

  logout(): void {
    this.auth.logout();
    this.notice = 'Sesión local finalizada.';
  }
}
