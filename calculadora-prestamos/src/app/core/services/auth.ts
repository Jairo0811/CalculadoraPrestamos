import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

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

  // Tokens remain in memory: no localStorage/sessionStorage containing credentials.
  readonly accessToken = this.currentToken.asReadonly();
  readonly expiresAtUtc = this.currentExpiry.asReadonly();
  readonly isAuthenticated = computed(() => !!this.currentToken());

  register(email: string, password: string): Observable<AccountProfile> {
    return this.http.post<AccountProfile>(`${this.endpoint}/register`, { email, password });
  }

  login(email: string, password: string): Observable<AccessTokenResponse> {
    return this.http.post<AccessTokenResponse>(`${this.endpoint}/login`, { email, password }).pipe(
      tap(result => {
        this.currentToken.set(result.accessToken);
        this.currentExpiry.set(result.expiresAtUtc);
      })
    );
  }

  logout(): void {
    this.currentToken.set(null);
    this.currentExpiry.set(null);
  }
}
