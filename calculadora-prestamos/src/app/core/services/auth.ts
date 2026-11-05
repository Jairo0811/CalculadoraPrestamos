import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import {
  Observable,
  catchError,
  defer,
  finalize,
  from,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError
} from 'rxjs';
import { APP_CONFIG } from '../config/app-config';

export interface AccountProfile {
  id: string;
  email: string;
  emailConfirmed: boolean;
}

export interface AccessTokenResponse {
  accessToken: string;
  tokenType: string;
  expiresAtUtc: string;
}

export interface MessageResponse {
  message: string;
}

/**
 * - `unknown`: aún no se ha intentado recuperar la sesión (o se está en SSR).
 * - `restoring`: renovando con la cookie HttpOnly al cargar la página.
 * - `authenticated` / `anonymous`: estado confirmado.
 */
export type SessionStatus = 'unknown' | 'restoring' | 'authenticated' | 'anonymous';

/** Encabezado anti-CSRF exigido por la API en los endpoints que usan la cookie de refresh. */
export const CSRF_HEADER = 'X-LoanCalc-CSRF';

const REFRESH_LOCK = 'loancalcrd-session-refresh';
/** Margen antes de la expiración para considerar el token caducado y renovarlo. */
const EXPIRY_MARGIN_MS = 30_000;
const PROACTIVE_REFRESH_MS = 60_000;

/**
 * Gestión centralizada de la sesión.
 *
 * - El access token (JWT de 15 min) vive SOLO en memoria (signal); nunca en localStorage/sessionStorage.
 * - El refresh token es una cookie HttpOnly que el JavaScript no puede leer.
 * - Las renovaciones son de vuelo único dentro de la pestaña y se serializan entre pestañas con
 *   Web Locks: el servidor revoca la sesión si el mismo refresh token se usa dos veces.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly token = signal<string | null>(null);
  private readonly expiresAt = signal<number | null>(null);
  private readonly currentProfile = signal<AccountProfile | null>(null);
  private readonly currentStatus = signal<SessionStatus>('unknown');
  private readonly expiredFlag = signal(false);

  private refreshInFlight: Observable<AccessTokenResponse> | null = null;
  private restoreInFlight: Observable<boolean> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  readonly enabled = this.config.features.accounts;
  readonly status = this.currentStatus.asReadonly();
  readonly profile = this.currentProfile.asReadonly();
  /** Se activa cuando una sesión existente caduca o se revoca (no al cerrar sesión voluntariamente). */
  readonly sessionExpired = this.expiredFlag.asReadonly();
  readonly isAuthenticated = computed(() => this.currentStatus() === 'authenticated' && this.token() !== null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.cancelRefreshTimer());
  }

  get authBaseUrl(): string {
    return `${this.config.apiBaseUrl}/auth`;
  }

  /** Token válido en memoria o `null` si no existe o está a punto de expirar. */
  accessToken(): string | null {
    const token = this.token();
    const expiresAt = this.expiresAt();
    if (!token || !expiresAt) return null;
    return expiresAt - EXPIRY_MARGIN_MS > Date.now() ? token : null;
  }

  /** Recupera la sesión al recargar la página usando la cookie HttpOnly. Nunca lanza error. */
  restoreSession(): Observable<boolean> {
    if (!this.isBrowser || !this.enabled) {
      if (this.currentStatus() === 'unknown') this.currentStatus.set('anonymous');
      return of(false);
    }
    if (this.isAuthenticated()) return of(true);
    if (this.restoreInFlight) return this.restoreInFlight;

    this.currentStatus.set('restoring');
    this.restoreInFlight = this.refresh().pipe(
      switchMap(() => this.loadProfile()),
      map(() => true),
      // Sin sesión previa o API inaccesible: la experiencia pública continúa como anónima.
      catchError(() => {
        this.clear('anonymous');
        return of(false);
      }),
      finalize(() => (this.restoreInFlight = null)),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    return this.restoreInFlight;
  }

  /** Espera a conocer el estado real de la sesión (para guards). */
  whenReady(): Observable<boolean> {
    const status = this.currentStatus();
    if (status === 'authenticated') return of(this.isAuthenticated() || this.accessToken() !== null);
    if (status === 'anonymous') return of(false);
    return this.restoreSession();
  }

  login(email: string, password: string): Observable<AccountProfile> {
    return this.http
      .post<AccessTokenResponse>(`${this.authBaseUrl}/login`, { email, password })
      .pipe(
        tap(response => this.accept(response)),
        switchMap(() => this.loadProfile())
      );
  }

  register(email: string, password: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${this.authBaseUrl}/register`, { email, password });
  }

  confirmEmail(userId: string, token: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${this.authBaseUrl}/confirm-email`, { userId, token });
  }

  resendConfirmation(email: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${this.authBaseUrl}/resend-confirmation`, { email });
  }

  forgotPassword(email: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${this.authBaseUrl}/forgot-password`, { email });
  }

  resetPassword(userId: string, token: string, newPassword: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${this.authBaseUrl}/reset-password`, { userId, token, newPassword });
  }

  changePassword(currentPassword: string, newPassword: string): Observable<AccountProfile> {
    return this.http
      .post<AccessTokenResponse>(`${this.authBaseUrl}/change-password`, { currentPassword, newPassword })
      .pipe(
        tap(response => this.accept(response)),
        switchMap(() => this.loadProfile())
      );
  }

  /**
   * Renueva el access token rotando la cookie de refresh. Las llamadas concurrentes comparten
   * la misma petición; nunca se envían dos renovaciones simultáneas con el mismo token.
   */
  refresh(): Observable<AccessTokenResponse> {
    if (!this.refreshInFlight) {
      const locks = this.refreshLocks();
      // Con Web Locks la renovación se serializa entre pestañas; sin ellos (navegadores antiguos,
      // pruebas) se usa directamente la petición HTTP.
      const request$ = locks
        ? defer(() => from(locks.request(REFRESH_LOCK, () => this.postRefresh()) as unknown as Promise<AccessTokenResponse>))
        : this.http.post<AccessTokenResponse>(`${this.authBaseUrl}/refresh`, {});
      this.refreshInFlight = request$.pipe(
        tap(response => this.accept(response)),
        catchError((error: unknown) => {
          // Un fallo de red no invalida la sesión; un 401/403 del servidor sí.
          if (error instanceof HttpErrorResponse && error.status !== 0) {
            this.handleRejectedSession();
          }
          return throwError(() => error);
        }),
        finalize(() => (this.refreshInFlight = null)),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }
    return this.refreshInFlight;
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.authBaseUrl}/logout`, {}).pipe(
      catchError(() => of(undefined)),
      finalize(() => this.clear('anonymous'))
    );
  }

  logoutAll(): Observable<void> {
    return this.http.post<void>(`${this.authBaseUrl}/logout-all`, {}).pipe(
      tap({ next: () => this.clear('anonymous') })
    );
  }

  /** Invocado por el interceptor cuando el servidor rechaza definitivamente la sesión. */
  handleRejectedSession(): void {
    const hadSession = this.currentStatus() === 'authenticated';
    this.clear('anonymous');
    if (hadSession) this.expiredFlag.set(true);
  }

  acknowledgeExpiredSession(): void {
    this.expiredFlag.set(false);
  }

  private loadProfile(): Observable<AccountProfile> {
    return this.http.get<AccountProfile>(`${this.authBaseUrl}/me`).pipe(
      tap(profile => {
        this.currentProfile.set(profile);
        this.currentStatus.set('authenticated');
        this.expiredFlag.set(false);
      })
    );
  }

  private postRefresh(): Promise<AccessTokenResponse> {
    return new Promise<AccessTokenResponse>((resolve, reject) => {
      this.http.post<AccessTokenResponse>(`${this.authBaseUrl}/refresh`, {}).subscribe({
        next: resolve,
        error: reject
      });
    });
  }

  private refreshLocks(): LockManager | null {
    if (!this.isBrowser || typeof navigator === 'undefined') return null;
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    return locks && typeof locks.request === 'function' ? locks : null;
  }

  private accept(response: AccessTokenResponse): void {
    const expiresAt = Date.parse(response.expiresAtUtc);
    this.token.set(response.accessToken);
    this.expiresAt.set(Number.isFinite(expiresAt) ? expiresAt : Date.now() + 5 * 60_000);
    this.scheduleProactiveRefresh();
  }

  private clear(status: SessionStatus): void {
    this.cancelRefreshTimer();
    this.token.set(null);
    this.expiresAt.set(null);
    this.currentProfile.set(null);
    this.currentStatus.set(status);
  }

  private scheduleProactiveRefresh(): void {
    this.cancelRefreshTimer();
    const expiresAt = this.expiresAt();
    if (!this.isBrowser || !expiresAt) return;
    const delay = Math.max(expiresAt - Date.now() - PROACTIVE_REFRESH_MS, 5_000);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      // Errores ya gestionados en refresh(); el interceptor reintentará si hace falta.
      this.refresh().subscribe({ error: () => undefined });
    }, delay);
  }

  private cancelRefreshTimer(): void {
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}
