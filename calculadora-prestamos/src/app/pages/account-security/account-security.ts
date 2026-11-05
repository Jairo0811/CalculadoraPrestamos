import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiErrorInfo, describeApiError } from '../../core/services/api-errors';
import { AuthService } from '../../core/services/auth';
import { evaluatePassword, meetsPasswordPolicy } from '../../core/validators/password-policy';

/** Área privada: perfil, cambio de contraseña y gestión de sesiones. Protegida por `authGuard`. */
@Component({
  selector: 'app-account-security',
  imports: [FormsModule, RouterLink],
  templateUrl: './account-security.html',
  styleUrl: './account-security.css'
})
export class AccountSecurity {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly changing = signal(false);
  readonly changeError = signal<ApiErrorInfo | null>(null);
  readonly changeSuccess = signal(false);
  readonly sessionBusy = signal<'logout' | 'all' | null>(null);
  readonly sessionError = signal<ApiErrorInfo | null>(null);
  readonly confirmAll = signal(false);
  readonly showPasswords = signal(false);

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  submitted = false;

  passwordChecks() {
    return evaluatePassword(this.newPassword);
  }

  invalid(field: 'current' | 'new' | 'confirm'): boolean {
    if (!this.submitted) return false;
    switch (field) {
      case 'current': return this.currentPassword.length === 0;
      case 'new': return !meetsPasswordPolicy(this.newPassword) || this.newPassword === this.currentPassword;
      case 'confirm': return this.newPassword !== this.confirmPassword;
    }
  }

  changePassword(form: NgForm): void {
    if (this.changing()) return;
    this.submitted = true;
    this.changeError.set(null);
    this.changeSuccess.set(false);
    if (form.invalid || this.invalid('current') || this.invalid('new') || this.invalid('confirm')) return;

    this.changing.set(true);
    this.auth.changePassword(this.currentPassword, this.newPassword)
      .pipe(finalize(() => this.changing.set(false)))
      .subscribe({
        next: () => {
          this.currentPassword = this.newPassword = this.confirmPassword = '';
          this.submitted = false;
          form.resetForm();
          this.changeSuccess.set(true);
        },
        error: error => {
          this.currentPassword = '';
          this.changeError.set(describeApiError(error));
        }
      });
  }

  logout(): void {
    this.sessionBusy.set('logout');
    this.auth.logout().pipe(finalize(() => this.sessionBusy.set(null)))
      .subscribe(() => void this.router.navigate(['/account'], { queryParams: { signedOut: '1' } }));
  }

  logoutAll(): void {
    if (!this.confirmAll()) {
      this.confirmAll.set(true);
      return;
    }
    this.sessionBusy.set('all');
    this.sessionError.set(null);
    this.auth.logoutAll().pipe(finalize(() => this.sessionBusy.set(null))).subscribe({
      next: () => void this.router.navigate(['/account'], { queryParams: { signedOut: 'all' } }),
      error: error => {
        this.confirmAll.set(false);
        this.sessionError.set(describeApiError(error));
      }
    });
  }
}
