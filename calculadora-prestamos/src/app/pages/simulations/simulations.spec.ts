import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../core/services/auth';
import { LoanApiService, PersistedLoanSimulation } from '../../core/services/loan-api';
import { LoanCalculatorService } from '../../core/services/loan-calculator';
import { ConfirmationService } from '../../core/services/confirmation';
import { Simulations } from './simulations';

const base: PersistedLoanSimulation = {
  id: '00000000-0000-0000-0000-000000000001', userId: 'user-A',
  name: 'Préstamo personal', loanType: 1, amount: 500000, annualRate: 18, termMonths: 36,
  isFavorite: false, createdAtUtc: '2026-11-01T00:00:00Z', updatedAtUtc: '2026-11-01T00:00:00Z'
};
const other: PersistedLoanSimulation = {
  ...base, id: '00000000-0000-0000-0000-000000000002',
  name: 'Hipotecario', loanType: 2, amount: 2000000, annualRate: 12, termMonths: 120, isFavorite: true,
  createdAtUtc: '2026-11-02T00:00:00Z'
};

describe('Fase 7 - private simulation dashboard', () => {
  let fixture: ComponentFixture<Simulations>;
  let page: Simulations;
  let api: {
    list: ReturnType<typeof vi.fn>;
    saveSimulation: ReturnType<typeof vi.fn>;
    setFavorite: ReturnType<typeof vi.fn>;
    rename: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let navigate: ReturnType<typeof vi.fn>;
  let confirmation: { ask: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    confirmation = { ask: vi.fn().mockResolvedValue(false) };
    api = {
      list: vi.fn(() => of([base, other])),
      saveSimulation: vi.fn(() => of({ ...base, id: 'imported' })),
      setFavorite: vi.fn((_id: string, favorite: boolean) => of({ ...base, isFavorite: favorite })),
      rename: vi.fn((_id: string, name: string) => of({ ...base, name })),
      delete: vi.fn(() => of(undefined))
    };
    TestBed.configureTestingModule({
      imports: [Simulations],
      providers: [
        provideRouter([]),
        { provide: LoanApiService, useValue: api },
        { provide: ConfirmationService, useValue: confirmation },
        { provide: AuthService, useValue: {
          enabled: true,
          isAuthenticated: signal(true),
          profile: signal({ id: 'user-A', email: 'ana@example.com', emailConfirmed: true })
        }}
      ]
    });
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.inject(Router).navigate = navigate as unknown as Router['navigate'];
    fixture = TestBed.createComponent(Simulations);
    page = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads only user-scoped records from the API and shows financial indicators', () => {
    expect(api.list).toHaveBeenCalledOnce();
    expect(page.total()).toBe(2);
    expect(page.favorites()).toBe(1);
    expect(page.totalSimulated()).toBe(2500000);
    expect(page.averageRate()).toBe(15);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Mis simulaciones');
  });

  it('filters, orders and compares up to two saved scenarios', () => {
    page.search.set('Hipotecario');
    expect(page.visible().map(x => x.id)).toEqual([other.id]);
    page.search.set('');
    page.filter.set('favorites');
    expect(page.visible().map(x => x.id)).toEqual([other.id]);
    page.filter.set('all');
    page.order.set('amount');
    expect(page.visible()[0].id).toBe(other.id);

    page.toggleCompare(base);
    page.toggleCompare(other);
    expect(page.comparisons()).toHaveLength(2);
    expect(page.comparisons()[0].monthlyPayment).toBeGreaterThan(0);
    page.clearComparison();
    expect(page.comparisons()).toEqual([]);
  });

  it('updates favorite and name only after backend success', () => {
    page.toggleFavorite(base);
    expect(api.setFavorite).toHaveBeenCalledWith(base.id, true);
    expect(page.items()[0].isFavorite).toBe(true);
    page.beginRename(base);
    page.editName = '  Un préstamo nuevo  ';
    page.rename(base);
    expect(api.rename).toHaveBeenCalledWith(base.id, 'Un préstamo nuevo');
    expect(page.items()[0].name).toBe('Un préstamo nuevo');
  });

  it('retains current data and shows a safe message if API fails', () => {
    api.list.mockReturnValue(throwError(() => new Error('internal connection password')));
    page.reload();
    expect(page.items()).toHaveLength(2);
    expect(page.error()).toContain('No pudimos cargar');
    expect(page.error()).not.toContain('password');
  });

  it('recalculates a cloud simulation without restoring PII from local history', () => {
    const calculator = TestBed.inject(LoanCalculatorService);
    calculator.saveResult(calculator.calculate({
      firstName: 'Datos', lastName: 'Privados', birthDate: '1990-01-01',
      documentId: '00100000001', loanType: 'Personal', amount: 100000,
      annualRate: 10, termMonths: 12
    }));

    page.open(other);
    const loaded = calculator.getResult();
    expect(loaded?.request.documentId).toBe('');
    expect(loaded?.request.firstName).toBe('');
    expect(loaded?.request.birthDate).toBe('');
    expect(loaded?.request.loanType).toBe('Hipotecario');
    expect(navigate).toHaveBeenCalledWith(['/results']);
  });

  it('never deletes a cloud simulation without explicit confirmation', async () => {
    await page.delete(base);
    expect(api.delete).not.toHaveBeenCalled();
    confirmation.ask.mockResolvedValueOnce(true);
    await page.delete(base);
    expect(api.delete).toHaveBeenCalledWith(base.id);
    expect(page.items()).toHaveLength(1);
  });

  it('never sends the full local history without explicit consent', async () => {
    const calculator = TestBed.inject(LoanCalculatorService);
    const request = {
      firstName: 'NombreSecreto', lastName: 'Privado', birthDate: '1992-05-03',
      documentId: '001-0000000-1', loanType: 'Comercial', amount: 850000,
      annualRate: 15, termMonths: 48
    };
    calculator.saveResult(calculator.calculate(request));
    await page.importLocal();
    expect(api.saveSimulation).not.toHaveBeenCalled();
    confirmation.ask.mockResolvedValue(true);
    await page.importLocal();
    expect(api.saveSimulation).toHaveBeenCalledOnce();
    const sent = api.saveSimulation.mock.calls[0][0];
    expect(sent.documentId).toBe(request.documentId); // El mapper API retira estos campos del payload.
    expect(page.items()).toHaveLength(3);
    expect(calculator.getHistory()).toHaveLength(1);
  });
});
