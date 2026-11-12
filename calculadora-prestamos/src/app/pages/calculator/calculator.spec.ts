import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { LoanCalculatorService } from '../../core/services/loan-calculator';
import { Calculator } from './calculator';

describe('Calculator', () => {
  let component: Calculator;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [Calculator], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Calculator);
    component = fixture.componentInstance;
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.inject(Router).navigate = navigate as unknown as Router['navigate'];
    fixture.detectChanges();
  });

  function fillFinancialData(): void {
    component.handleAmountInput('500,000');
    component.request.loanType = 'Personal';
    component.annualRate = 18;
    component.termMonths = 36;
  }

  it('starts with empty numeric fields instead of zeros', () => {
    expect(component.annualRate).toBeNull();
    expect(component.termMonths).toBeNull();
  });

  it('simulates anonymously with only financial data', () => {
    fillFinancialData();
    component.calculate();

    expect(component.errorMessage).toBe('');
    expect(navigate).toHaveBeenCalledWith(['/results']);
    const saved = TestBed.inject(LoanCalculatorService).getResult();
    expect(saved?.monthlyPayment).toBeCloseTo(18076.2, 1);
    expect(saved?.request.documentId).toBe('');
    expect(saved?.request.firstName).toBe('');
  });

  it('permits zero interest, matching the financial engine', () => {
    fillFinancialData();
    component.annualRate = 0;
    component.calculate();
    expect(component.rateError).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/results']);
    const saved = TestBed.inject(LoanCalculatorService).getResult();
    expect(saved?.monthlyPayment).toBeCloseTo(500000 / 36, 2);
    expect(saved?.totalInterest).toBeCloseTo(0, 2);
  });

  it('rejects a negative annual rate', () => {
    fillFinancialData();
    component.annualRate = -1;
    component.calculate();
    expect(component.rateError).toContain('negativa');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows contextual errors for each missing financial field', () => {
    component.calculate();
    expect(component.amountError).toContain('monto');
    expect(component.loanTypeError).toContain('tipo');
    expect(component.rateError).toContain('tasa');
    expect(component.termError).toContain('plazo');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('rejects out-of-range rates and terms', () => {
    fillFinancialData();
    component.annualRate = 150;
    component.termMonths = 700;
    component.calculate();
    expect(component.rateError).toContain('100');
    expect(component.termError).toContain('600');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('validates the optional cédula only when it is provided', () => {
    fillFinancialData();
    component.request.documentId = '123';
    component.calculate();
    expect(component.errorMessage).toContain('11 dígitos');
    expect(component.showPersonalData).toBe(true);
    expect(navigate).not.toHaveBeenCalled();

    component.request.documentId = '';
    component.calculate();
    expect(navigate).toHaveBeenCalledWith(['/results']);
  });

  it('offers quick term presets and a readable equivalent', () => {
    component.selectTerm(60);
    expect(component.termMonths).toBe(60);
    expect(component.termHint).toBe('5 años');
    component.termMonths = 18;
    expect(component.termHint).toBe('1 año y 6 meses');
  });

  it('clears every field', () => {
    fillFinancialData();
    component.clear();
    expect(component.amountDisplay).toBe('');
    expect(component.annualRate).toBeNull();
    expect(component.request.loanType).toBe('');
  });
});
