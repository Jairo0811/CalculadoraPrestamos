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