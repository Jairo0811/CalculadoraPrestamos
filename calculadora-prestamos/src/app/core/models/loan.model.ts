export interface LoanRequest {
  firstName: string;
  lastName: string;
  birthDate: string;
  documentId: string;
  amount: number;
  annualRate: number;
  termMonths: number;
  loanType: string;
}

export interface AmortizationRow {
  number: number;
  paymentDate: string;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}

export interface LoanResult {
  request: LoanRequest;
  age: number | null;
  monthlyPayment: number;
  totalPayment: number;
  totalInterest: number;
  amortization: AmortizationRow[];
}

export type ExtraPaymentFrequency = 'single' | 'monthly';

export type ExtraPaymentStrategy = 'reduce-term' | 'reduce-payment';

export interface ExtraPaymentRequest {
  /**
   * Configuración original del préstamo.
   */
  loan: LoanRequest;

  /**
   * Monto del abono extraordinario.
   */
  amount: number;

  /**
   * Mes a partir del cual se aplicará el abono.
   * Para un abono único, representa el mes exacto.
   */
  startMonth: number;

  /**
   * Define si el abono se realiza una sola vez
   * o de manera recurrente.
   */
  frequency: ExtraPaymentFrequency;

  /**
   * Indica si el cliente desea reducir el plazo
   * o recalcular la cuota restante.
   */
  strategy: ExtraPaymentStrategy;
}

export interface ExtraPaymentAmortizationRow extends AmortizationRow {
  regularPayment: number;
  extraPayment: number;
}

export interface ExtraPaymentResult {
  request: ExtraPaymentRequest;

  originalResult: LoanResult;

  newMonthlyPayment: number;
  finalMonthlyPayment: number;

  originalTermMonths: number;
  newTermMonths: number;
  monthsSaved: number;

  originalTotalInterest: number;
  newTotalInterest: number;
  interestSaved: number;

  originalTotalPayment: number;
  newTotalPayment: number;
  totalExtraPayments: number;

  amortization: ExtraPaymentAmortizationRow[];
}