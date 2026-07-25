import { ExtraPaymentRequest, LoanRequest } from '../models/loan.model';
import { LoanCalculatorService } from './loan-calculator';

describe('LoanCalculatorService', () => {
  let service: LoanCalculatorService;

  const createLoanRequest = (
    overrides: Partial<LoanRequest> = {}
  ): LoanRequest => ({
    firstName: 'Jairo',
    lastName: 'Matías',
    birthDate: '1997-11-08',
    documentId: '001-0000000-1',
    amount: 500_000,
    annualRate: 18,
    termMonths: 60,
    loanType: 'Personal',
    ...overrides
  });

  beforeEach(() => {
    localStorage.clear();
    service = new LoanCalculatorService();
  });

  describe('calculate', () => {
    it('debe calcular correctamente un préstamo amortizado', () => {
      const result = service.calculate(createLoanRequest());

      expect(result.monthlyPayment).toBeGreaterThan(0);
      expect(result.totalPayment).toBeGreaterThan(
        result.request.amount
      );
      expect(result.totalInterest).toBeGreaterThan(0);
      expect(result.amortization).toHaveLength(60);
    });

    it('debe manejar correctamente una tasa anual de cero', () => {
      const result = service.calculate(
        createLoanRequest({
          amount: 120_000,
          annualRate: 0,
          termMonths: 12
        })
      );

      expect(result.monthlyPayment).toBeCloseTo(10_000, 2);
      expect(result.totalInterest).toBeCloseTo(0, 2);
      expect(result.totalPayment).toBeCloseTo(120_000, 2);
    });

    it('debe finalizar la tabla de amortización con balance cero', () => {
      const result = service.calculate(createLoanRequest());
      const finalRow = result.amortization.at(-1);

      expect(finalRow).toBeDefined();
      expect(finalRow?.balance).toBeCloseTo(0, 2);
    });

    it('debe generar exactamente una fila por cada mes del plazo', () => {
      const result = service.calculate(
        createLoanRequest({
          termMonths: 36
        })
      );

      expect(result.amortization).toHaveLength(36);
      expect(result.amortization[0].number).toBe(1);
      expect(result.amortization.at(-1)?.number).toBe(36);
    });

    it('debe rechazar montos iguales o menores que cero', () => {
      expect(() =>
        service.calculate(
          createLoanRequest({
            amount: 0
          })
        )
      ).toThrowError(
        'El monto del préstamo debe ser mayor que cero.'
      );
    });

    it('debe rechazar tasas anuales negativas', () => {
      expect(() =>
        service.calculate(
          createLoanRequest({
            annualRate: -1
          })
        )
      ).toThrowError(
        'La tasa anual no puede ser negativa.'
      );
    });

    it('debe rechazar plazos inválidos', () => {
      expect(() =>
        service.calculate(
          createLoanRequest({
            termMonths: 0
          })
        )
      ).toThrowError(
        'El plazo debe ser una cantidad válida de meses.'
      );
    });
  });

  describe('calculateExtraPaymentScenario', () => {
    it('debe reducir el plazo con un abono extraordinario único', () => {
      const loan = createLoanRequest();

      const extraPaymentRequest: ExtraPaymentRequest = {
        loan,
        amount: 50_000,
        startMonth: 12,
        frequency: 'single',
        strategy: 'reduce-term'
      };

      const result = service.calculateExtraPaymentScenario(
        extraPaymentRequest
      );

      expect(result.newTermMonths).toBeLessThan(
        result.originalTermMonths
      );

      expect(result.monthsSaved).toBeGreaterThan(0);
      expect(result.interestSaved).toBeGreaterThan(0);
      expect(result.totalExtraPayments).toBeCloseTo(50_000, 2);
      expect(result.amortization.at(-1)?.balance).toBeCloseTo(
        0,
        2
      );
    });

    it('debe aplicar el abono único solamente en el mes indicado', () => {
      const result = service.calculateExtraPaymentScenario({
        loan: createLoanRequest(),
        amount: 25_000,
        startMonth: 6,
        frequency: 'single',
        strategy: 'reduce-term'
      });

      const rowsWithExtraPayment = result.amortization.filter(
        row => row.extraPayment > 0
      );

      expect(rowsWithExtraPayment).toHaveLength(1);
      expect(rowsWithExtraPayment[0].number).toBe(6);
      expect(rowsWithExtraPayment[0].extraPayment).toBeCloseTo(
        25_000,
        2
      );
    });

    it('debe aplicar abonos mensuales desde el mes seleccionado', () => {
      const result = service.calculateExtraPaymentScenario({
        loan: createLoanRequest(),
        amount: 5_000,
        startMonth: 4,
        frequency: 'monthly',
        strategy: 'reduce-term'
      });

      const monthsBeforeStart = result.amortization.filter(
        row => row.number < 4
      );

      const monthsAfterStart = result.amortization.filter(
        row => row.number >= 4
      );

      expect(
        monthsBeforeStart.every(row => row.extraPayment === 0)
      ).toBe(true);

      expect(
        monthsAfterStart.some(row => row.extraPayment > 0)
      ).toBe(true);

      expect(result.newTermMonths).toBeLessThan(
        result.originalTermMonths
      );

      expect(result.interestSaved).toBeGreaterThan(0);
    });

    it('debe reducir la cuota restante después del abono', () => {
      const originalLoan = createLoanRequest();

      const result = service.calculateExtraPaymentScenario({
        loan: originalLoan,
        amount: 75_000,
        startMonth: 12,
        frequency: 'single',
        strategy: 'reduce-payment'
      });

      const rowBeforeExtraPayment = result.amortization.find(
        row => row.number === 12
      );

      const rowAfterExtraPayment = result.amortization.find(
        row => row.number === 13
      );

      expect(rowBeforeExtraPayment?.extraPayment).toBeGreaterThan(
        0
      );

      expect(rowAfterExtraPayment).toBeDefined();

      expect(rowAfterExtraPayment!.regularPayment).toBeLessThan(
        result.originalResult.monthlyPayment
      );

      expect(result.newTotalInterest).toBeLessThan(
        result.originalTotalInterest
      );
    });

    it('no debe permitir un abono extraordinario igual a cero', () => {
      expect(() =>
        service.calculateExtraPaymentScenario({
          loan: createLoanRequest(),
          amount: 0,
          startMonth: 12,
          frequency: 'single',
          strategy: 'reduce-term'
        })
      ).toThrowError(
        'El abono extraordinario debe ser mayor que cero.'
      );
    });

    it('no debe permitir un mes fuera del plazo original', () => {
      expect(() =>
        service.calculateExtraPaymentScenario({
          loan: createLoanRequest({
            termMonths: 24
          }),
          amount: 10_000,
          startMonth: 25,
          frequency: 'single',
          strategy: 'reduce-term'
        })
      ).toThrowError(
        'El mes de inicio del abono debe estar dentro del plazo original.'
      );
    });
  });

  describe('historial local', () => {
    it('debe guardar y recuperar una simulación', () => {
      const result = service.calculate(createLoanRequest());

      service.saveResult(result);

      const storedResult = service.getResult();
      const history = service.getHistory();

      expect(storedResult).not.toBeNull();
      expect(storedResult?.request.amount).toBe(500_000);
      expect(history).toHaveLength(1);
    });

    it('no debe duplicar simulaciones con la misma información', () => {
      const result = service.calculate(createLoanRequest());

      service.saveResult(result);
      service.saveResult(result);

      expect(service.getHistory()).toHaveLength(1);
    });

    it('debe eliminar una simulación del historial', () => {
      const firstResult = service.calculate(
        createLoanRequest({
          amount: 500_000
        })
      );

      const secondResult = service.calculate(
        createLoanRequest({
          amount: 300_000
        })
      );

      service.saveResult(firstResult);
      service.saveResult(secondResult);

      expect(service.getHistory()).toHaveLength(2);

      service.removeHistoryItem(0);

      expect(service.getHistory()).toHaveLength(1);
    });

    it('debe limpiar completamente el historial', () => {
      const result = service.calculate(createLoanRequest());

      service.saveResult(result);
      service.clearHistory();

      expect(service.getHistory()).toEqual([]);
    });
  });
});