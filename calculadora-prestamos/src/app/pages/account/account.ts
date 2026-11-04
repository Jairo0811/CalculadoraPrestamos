import { Component, OnInit, inject } from '@angular/core';
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
export class Account implements OnInit {
  readonly auth = inject(AuthService);

  email = '';
  password = '';
  mode: 'login' | 'register' = 'login';
  busy = false;
  error = '';
  notice = '';

  ngOnInit(): void {
    // En desarrollo, recuperar la sesión activa desde la cookie HttpOnly sin almacenar JWT.
    this.auth.refresh().subscribe({ error: () => { /* La cuenta puede ser anónima. */ } });
  }

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
          error: () => {
            this.password = '';
            this.error = 'No se pudo crear la cuenta. Verifica el correo y los requisitos de contraseña.';
          }
        });
      return;
    }

    this.auth.login(this.email.trim(), this.password)
      .pipe(finalize(() => { this.busy = false; }))
      .subscribe({
        next: () => {
          this.password = '';
          this.notice = 'Sesión iniciada y protegida. Puedes administrar tus simulaciones privadas.';
        },
        error: () => {
          this.password = '';
          this.error = 'No se pudo iniciar sesión. Revisa las credenciales y la conexión con la API.';
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
}
