import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { formatRd } from '../formatting/rd-currency';
import { LoanRequest } from '../models/loan.model';

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

/** Contrato que se envía a la API: SOLO datos financieros. Nunca nombre, fecha de nacimiento ni cédula. */
export interface CreateSimulationPayload {
  name: string;
  loanType: number;
  amount: number;
  annualRate: number;
  termMonths: number;
}

const LOAN_TYPES: Record<string, number> = {
  Personal: 1,
  Hipotecario: 2,
  Vehículo: 3,
  Educativo: 4,
  Comercial: 5
};

/**
 * Cliente de simulaciones privadas. La autenticación (Bearer, renovación y reintento)
 * la aplica `authInterceptor`; el servidor identifica al propietario solo por el JWT.
 */
@Injectable({ providedIn: 'root' })
export class LoanApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  private get endpoint(): string {
    return `${this.config.apiBaseUrl}/simulations`;
  }

  list(): Observable<PersistedLoanSimulation[]> {
    return this.http.get<PersistedLoanSimulation[]>(this.endpoint);
  }

  saveSimulation(request: LoanRequest): Observable<PersistedLoanSimulation> {
    return this.http.post<PersistedLoanSimulation>(this.endpoint, toCreatePayload(request));
  }

  rename(id: string, name: string): Observable<PersistedLoanSimulation> {
    return this.http.patch<PersistedLoanSimulation>(`${this.endpoint}/${encodeURIComponent(id)}/name`, { name });
  }

  setFavorite(id: string, isFavorite: boolean): Observable<PersistedLoanSimulation> {
    return this.http.patch<PersistedLoanSimulation>(`${this.endpoint}/${encodeURIComponent(id)}/favorite`, { isFavorite });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.endpoint}/${encodeURIComponent(id)}`);
  }
}

export function toCreatePayload(request: LoanRequest): CreateSimulationPayload {
  return {
    name: `${request.loanType || 'Préstamo'} · ${formatRd(request.amount, 0)}`.slice(0, 120),
    loanType: LOAN_TYPES[request.loanType] ?? 1,
    amount: request.amount,
    annualRate: request.annualRate,
    termMonths: request.termMonths
  };
}
