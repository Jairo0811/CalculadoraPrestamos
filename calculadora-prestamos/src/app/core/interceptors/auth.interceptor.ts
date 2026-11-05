import {
  HttpContextToken,
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { AuthService, CSRF_HEADER } from '../services/auth';

/** Marca una petición ya reintentada tras renovar la sesión, para evitar bucles. */
export const AUTH_RETRIED = new HttpContextToken<boolean>(() => false);

/** Endpoints públicos de cuenta: nunca llevan Bearer ni disparan renovación automática. */
const PUBLIC_AUTH_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
  '/auth/confirm-email',
  '/auth/resend-confirmation',
  '/auth/forgot-password',
  '/auth/reset-password'
]);

/** Endpoints que usan la cookie HttpOnly de refresh y exigen el encabezado anti-CSRF. */
const COOKIE_AUTH_PATHS = new Set(['/auth/refresh', '/auth/logout', '/auth/logout-all']);

/**
 * - Solo actúa sobre la API configurada (nunca filtra tokens a otros dominios).
 * - Adjunta el access token en memoria como Bearer.
 * - Ante un 401 renueva UNA vez (vuelo único compartido) y reintenta UNA vez.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const config = inject(APP_CONFIG);
  const path = apiPath(request.url, config.apiBaseUrl);
  if (path === null) return next(request);

  const auth = inject(AuthService);
  let prepared = request;

  if (path.startsWith('/auth/')) {
    // La cookie de refresh solo se envía/recibe con credenciales y su Path es /api/v1/auth.
    prepared = prepared.clone({ withCredentials: true });
  }
  if (COOKIE_AUTH_PATHS.has(path)) {
    prepared = prepared.clone({ setHeaders: { [CSRF_HEADER]: '1' } });
  }
  if (PUBLIC_AUTH_PATHS.has(path)) {
    return next(prepared);
  }

  const token = auth.accessToken();
  return next(token ? withBearer(prepared, token) : prepared).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || request.context.get(AUTH_RETRIED)) {
        return throwError(() => error);
      }
      return retryAfterRefresh(prepared, next, auth, error);
    })
  );
};

function retryAfterRefresh(
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
  auth: AuthService,
  originalError: HttpErrorResponse
) {
  return auth.refresh().pipe(
    catchError(() => throwError(() => originalError)),
    switchMap(session => {
      const retried = request.clone({ context: request.context.set(AUTH_RETRIED, true) });
      return next(withBearer(retried, session.accessToken)).pipe(
        catchError((retryError: unknown) => {
          if (retryError instanceof HttpErrorResponse && retryError.status === 401) {
            auth.handleRejectedSession();
          }
          return throwError(() => retryError);
        })
      );
    })
  );
}

function withBearer(request: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

/** Devuelve la ruta relativa a la API (p. ej. `/auth/login`) o `null` si la URL es de otro origen. */
export function apiPath(url: string, apiBaseUrl: string): string | null {
  if (!url.startsWith(apiBaseUrl)) return null;
  const rest = url.slice(apiBaseUrl.length);
  if (rest !== '' && !rest.startsWith('/') && !rest.startsWith('?')) return null;
  const path = rest.split('?')[0].replace(/\/+$/, '');
  return path === '' ? '/' : path;
}
