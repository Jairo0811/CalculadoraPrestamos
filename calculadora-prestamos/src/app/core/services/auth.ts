import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, of, tap } from 'rxjs';

export interface AccountProfile {
  id: string;
  email: string;
}

export interface AccessTokenResponse {
  accessToken: string;
  tokenType: string;
  expiresAtUtc: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = 'http://localhost:5000/api/v1/auth';
  private readonly currentToken = signal<string | null>(null);
  private readonly currentExpiry = signal<string | null>(null);

  // El JWT solo está en memoria. El refresh token está en cookie HttpOnly del servidor.
  readonly accessToken = this.currentToken.asReadonly();
  readonly expiresAtUtc = this.currentExpiry.asReadonly();
  readonly isAuthenticated = computed(() => {
    const token = this.currentToken();
    const expiry = this.currentExpiry();
    return !!token && !!expiry && new Date(expiry).getTime() > Date.now();
  });

  register(email: string, password: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.endpoint}/register`, { email, password });
  }

  confirmEmail(userId: string, token: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.endpoint}/confirm-email`, { userId, token });
  }

  resendConfirmation(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.endpoint}/resend-confirmation`, { email });
  }

  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.endpoint}/forgot-password`, { email });
  }

  resetPassword(email: string, token: string, newPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.endpoint}/reset-password`, { email, token, newPassword });
  }

  login(email: string, password: string): Observable<AccessTokenResponse> {
    return this.http.post<AccessTokenResponse>(
      `${this.endpoint}/login`, { email, password }, { withCredentials: true }
    ).pipe(tap(result => this.accept(result)));
  }

  refresh(): Observable<AccessTokenResponse> {
    return this.http.post<AccessTokenResponse>(`${this.endpoint}/refresh`, {}, {
      withCredentials: true,
      headers: this.csrfHeader()
    }).pipe(
      tap(result => this.accept(result)),
      catchError(error => {
        this.clear();
        throw error;
      })
    );
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.endpoint}/logout`, {}, {
      withCredentials: true,
      headers: this.csrfHeader()
    }).pipe(finalize(() => this.clear()));
  }

  logoutAll(): Observable<void> {
    return this.http.post<void>(`${this.endpoint}/logout-all`, {}, {
      withCredentials: true,
      headers: this.authorizedCsrfHeader()
    }).pipe(finalize(() => this.clear()));
  }

  me(): Observable<AccountProfile> {
    return this.http.get<AccountProfile>(`${this.endpoint}/me`, {
      headers: this.authorizedCsrfHeader()
    });
  }

  private accept(response: AccessTokenResponse): void {
    this.currentToken.set(response.accessToken);
    this.currentExpiry.set(response.expiresAtUtc);
  }

  private clear(): void {
    this.currentToken.set(null);
    this.currentExpiry.set(null);
  }

  private csrfHeader(): HttpHeaders {
    return new HttpHeaders({ 'X-LoanCalc-CSRF': '1' });
  }

  private authorizedCsrfHeader(): HttpHeaders {
    const token = this.currentToken();
    return token ? this.csrfHeader().set('Authorization', `Bearer ${token}`) : this.csrfHeader();
  }
}
