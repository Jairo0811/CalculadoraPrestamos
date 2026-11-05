import { LoanRequest } from '../models/loan.model';
import { PersistedLoanSimulation } from './loan-api';

/**
 * Solo los cinco campos financieros regresan del servidor al motor de cálculo.
 * La API NO almacena nombre, cédula ni fecha de nacimiento.
 */
const TYPES: Record<number, string> = {
  1: 'Personal',
  2: 'Hipotecario',
  3: 'Vehículo',
  4: 'Educativo',
  5: 'Comercial'
};

export function loanTypeLabel(value: number): string {
  return TYPES[value] ?? 'Personal';
}

export function toAnonymousLoanRequest(item: Pick<PersistedLoanSimulation,
  'loanType' | 'amount' | 'annualRate' | 'termMonths'>): LoanRequest {
  return {
    firstName: '',
    lastName: '',
    birthDate: '',
    documentId: '',
    loanType: loanTypeLabel(item.loanType),
    amount: Number(item.amount),
    annualRate: Number(item.annualRate),
    termMonths: Number(item.termMonths)
  };
}

export function simulationFingerprint(item: Pick<PersistedLoanSimulation,
  'loanType' | 'amount' | 'annualRate' | 'termMonths'>): string {
  return [
    item.loanType,
    Number(item.amount).toFixed(2),
    Number(item.annualRate).toFixed(4),
    Number(item.termMonths)
  ].join('|');
}
