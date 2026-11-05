import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { AuthService } from '../services/auth';

/** Las rutas de cuenta solo existen cuando la funcionalidad está habilitada en el entorno. */
export const accountsEnabledGuard: CanMatchFn = () => inject(APP_CONFIG).features.accounts;

/** Protege rutas privadas: espera a recuperar la sesión y, si no existe, envía al inicio de sesión. */
export const authGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  const loginUrl = router.createUrlTree(['/account'], { queryParams: { returnUrl: state.url } });
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return loginUrl;

  return inject(AuthService).whenReady().pipe(map(authenticated => (authenticated ? true : loginUrl)));
};

/** Acepta solo rutas internas para redirigir tras el login (evita redirecciones abiertas). */
export function safeReturnUrl(value: string | null | undefined, fallback = '/account/security'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (value.startsWith('/account') && !value.startsWith('/account/security')) return fallback;
  return value;
}
