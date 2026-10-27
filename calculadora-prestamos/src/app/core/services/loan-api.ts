import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { LoanRequest } from '../models/loan.model';
import { AuthService } from './auth';

export interface PersistedLoanSimulation {
  id: string;
  userId: string;
  name: string;
  loanType: number;
  amount: number;
  annualRate: number;
  termMonths: number;
  isFavorite: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
}

@Injectable({ providedIn: 'root' })
export class LoanApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly endpoint = 'http://localhost:5000/api/v1/simulations';

  list(): Observable<PersistedLoanSimulation[]> {
    const headers = this.headers();
    return headers
      ? this.http.get<PersistedLoanSimulation[]>(this.endpoint, { headers })
      : throwError(() => new Error('Debes iniciar sesión para ver tus simulaciones guardadas.'));
  }

  saveSimulation(request: LoanRequest): Observable<PersistedLoanSimulation> {
    const headers = this.headers();
    if (!headers) {
      return throwError(() => new Error('Debes iniciar sesión para guardar en la nube.'));
    }

    return this.http.post<PersistedLoanSimulation>(this.endpoint, {
      name: `${request.loanType} · RD$${request.amount.toLocaleString('en-US')}`,
      loanType: this.mapLoanType(request.loanType),
      amount: request.amount,
      annualRate: request.annualRate,
      termMonths: request.termMonths
    }, { headers });
  }

  rename(id: string, name: string): Observable<PersistedLoanSimulation> {
    const headers = this.headers();
    return headers
      ? this.http.patch<PersistedLoanSimulation>(`${this.endpoint}/${encodeURIComponent(id)}/name`, { name }, { headers })
      : throwError(() => new Error('Sesión requerida.'));
  }

  setFavorite(id: string, isFavorite: boolean): Observable<PersistedLoanSimulation> {
    const headers = this.headers();
    return headers
      ? this.http.patch<PersistedLoanSimulation>(`${this.endpoint}/${encodeURIComponent(id)}/favorite`, { isFavorite }, { headers })
      : throwError(() => new Error('Sesión requerida.'));
  }

  delete(id: string): Observable<void> {
    const headers = this.headers();
    return headers
      ? this.http.delete<void>(`${this.endpoint}/${encodeURIComponent(id)}`, { headers })
      : throwError(() => new Error('Sesión requerida.'));
  }

  private headers(): HttpHeaders | null {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : null;
  }

  private mapLoanType(loanType: string): number {
    const values: Record<string, number> = {
      Personal: 1,
      Hipotecario: 2,
      Vehículo: 3,
      Educativo: 4,
      Comercial: 5
    };
    return values[loanType] ?? 1;
  }
}
