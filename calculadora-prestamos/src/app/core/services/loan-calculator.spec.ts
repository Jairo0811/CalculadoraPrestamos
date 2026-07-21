import { beforeEach, describe, expect, it } from 'vitest';
import { LoanRequest } from '../models/loan.model';
import { LoanCalculatorService } from './loan-calculator';

describe('LoanCalculatorService', () => {
  let service: LoanCalculatorService;

  const request: LoanRequest = {
    firstName: 'Francis Jairo',
    lastName: 'Matías Rosario',
    birthDate: '1997-11-08',
    documentId: '001-1391820-5',
    amount: 250000,
    annualRate: 18,
    termMonths: 36,
    loanType: 'Personal'
  };

  beforeEach(() => {
    localStorage.clear();
    service = new LoanCalculatorService();
  });

  it('calcula una cuota fija y genera todas las filas de amortización', () => {
    const result = service.calculate(request);

    expect(result.monthlyPayment).toBeGreaterThan(0);
    expect(result.totalInterest).toBeGreaterThan(0);
    expect(result.amortization).toHaveLength(36);
    expect(result.amortization.at(-1)?.balance).toBeCloseTo(0, 8);
  });

  it('mantiene la suma de capital igual al monto solicitado', () => {
    const result = service.calculate(request);
    const totalPrincipal = result.amortization.reduce((sum, row) => sum + row.principal, 0);

    expect(totalPrincipal).toBeCloseTo(request.amount, 2);
  });

  it('maneja correctamente un préstamo con tasa cero', () => {
    const result = service.calculate({ ...request, annualRate: 0, termMonths: 10 });

    expect(result.monthlyPayment).toBe(25000);
    expect(result.totalInterest).toBe(0);
    expect(result.totalPayment).toBe(250000);
    expect(result.amortization.at(-1)?.balance).toBe(0);
  });

  it('guarda y recupera el resultado actual', () => {
    const result = service.calculate(request);
    service.saveResult(result);

    expect(service.getResult()).toEqual(result);
  });

  it('evita duplicados en el historial y conserva la simulación más reciente', () => {
    const first = service.calculate(request);
    const updated = service.calculate({ ...request, firstName: 'Jairo actualizado' });

    service.saveResult(first);
    service.saveResult(updated);

    const history = service.getHistory();

    expect(history).toHaveLength(1);
    expect(history[0].request.firstName).toBe('Jairo actualizado');
  });

  it('elimina elementos individuales y limpia el historial completo', () => {
    service.saveResult(service.calculate(request));
    service.saveResult(
      service.calculate({
        ...request,
        documentId: '402-1242850-8',
        amount: 500000,
        loanType: 'Hipotecario'
      })
    );

    expect(service.getHistory()).toHaveLength(2);

    service.removeHistoryItem(0);
    expect(service.getHistory()).toHaveLength(1);

    service.clearHistory();
    expect(service.getHistory()).toEqual([]);
  });
});
