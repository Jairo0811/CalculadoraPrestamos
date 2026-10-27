import { HttpClient } from '@angular/common/http';
import { Injectable, inject, isDevMode } from '@angular/core';
import { Observable, EMPTY } from 'rxjs';
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

@Injectable({ providedIn: 'root' })
export class LoanApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = 'https://localhost:7080/api/v1/dev';
  private readonly developmentUserId = '11111111-1111-1111-1111-111111111111';

  saveDevelopmentSimulation(request: LoanRequest): Observable<PersistedLoanSimulation> {
    if (!isDevMode()) {
      return EMPTY;
    }

    return this.http.post<PersistedLoanSimulation>(
      `${this.apiBaseUrl}/users/${this.developmentUserId}/simulations`,
      {
        name: `${request.loanType} · RD$${request.amount.toLocaleString('en-US')}`,
        loanType: this.mapLoanType(request.loanType),
        amount: request.amount,
        annualRate: request.annualRate,
        termMonths: request.termMonths
      }
    );
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
