import { loanTypeLabel, simulationFingerprint, toAnonymousLoanRequest } from './cloud-simulation';

const simulation = {
  id: 'a', userId: 'u', name: 'Auto', loanType: 3,
  amount: 500000, annualRate: 18, termMonths: 36, isFavorite: false,
  createdAtUtc: '2026-11-01T00:00:00Z', updatedAtUtc: '2026-11-01T00:00:00Z'
};

describe('Cloud simulation mapping', () => {
  it('converts persisted values to an anonymous financial request', () => {
    expect(toAnonymousLoanRequest(simulation)).toEqual({
      firstName: '', lastName: '', birthDate: '', documentId: '',
      loanType: 'Vehículo', amount: 500000, annualRate: 18, termMonths: 36
    });
    expect(loanTypeLabel(2)).toBe('Hipotecario');
    expect(loanTypeLabel(5)).toBe('Comercial');
  });

  it('deduplicates equivalent financial terms without personal data', () => {
    expect(simulationFingerprint(simulation)).toBe(simulationFingerprint({
      ...simulation, amount: '500000' as unknown as number,
      annualRate: 18.0000, termMonths: 36, loanType: 3
    }));
    expect(simulationFingerprint({ ...simulation, annualRate: 18.5 })).not.toBe(simulationFingerprint(simulation));
  });
});
