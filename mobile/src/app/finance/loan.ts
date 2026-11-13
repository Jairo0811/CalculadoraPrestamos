// Prototipo M0: cálculo local sin API ni DOM. Fórmula replicada del servicio web.
// M1 debe extraer el motor financiero puro a una biblioteca compartida.
export interface LoanTerms { amount: number; annualRate: number; termMonths: number; }
export interface PaymentRow { month: number; payment: number; interest: number; principal: number; balance: number; }
export interface LoanResult { monthlyPayment: number; totalInterest: number; totalPayment: number; rows: PaymentRow[]; }
export function calculateLoan({amount, annualRate, termMonths}: LoanTerms): LoanResult {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000)
    throw new Error('Monto inválido: utiliza un valor mayor que cero, hasta RD$ 1,000,000,000.');
  if (!Number.isFinite(annualRate) || annualRate < 0 || annualRate > 100)
    throw new Error('La tasa debe estar entre 0 y 100 %.');
  if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 600)
    throw new Error('El plazo debe estar entre 1 y 600 meses.');
  const r = annualRate / 1200;
  const monthlyPayment = r === 0 ? amount / termMonths : amount*r/(1-Math.pow(1+r,-termMonths));
  let balance=amount, totalInterest=0, totalPayment=0;
  const rows: PaymentRow[]=[];
  for(let month=1;month<=termMonths;month++){
    const interest=balance*r;
    const principal=Math.min(Math.max(monthlyPayment-interest,0),balance);
    balance=Math.max(balance-principal,0);
    const payment=month===termMonths ? principal+interest : monthlyPayment;
    rows.push({month,payment,interest,principal,balance});
    totalInterest+=interest; totalPayment+=payment;
  }
  return {monthlyPayment,totalInterest,totalPayment,rows};
}
export function parseDecimal(input: string): number {
  const value=input.trim().replace(/\s/g,'');
  return /^\d+(?:[.,]\d{1,2})?$/.test(value) ? Number(value.replace(',','.')) : NaN;
}
export function parseMonths(input: string): number {
  return /^\d+$/.test(input.trim()) ? Number(input.trim()) : NaN;
}
export function moneyRD(value: number): string {
  return new Intl.NumberFormat('es-DO',{style:'currency',currency:'DOP',minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
}
