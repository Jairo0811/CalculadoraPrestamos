import { describe, expect, it } from 'vitest';
import { calculateLoan, parseDecimal, parseMonths } from './loan.ts';
describe('LoanCalcRD Mobile M0: préstamos',()=>{
  it('calcula RD$500000 al 18 % durante 36 meses',()=>{
    const r=calculateLoan({amount:500000,annualRate:18,termMonths:36});
    expect(r.monthlyPayment).toBeCloseTo(18076.2,1);
    expect(r.rows).toHaveLength(36);
    expect(r.rows[35]?.balance).toBe(0);
    expect(r.totalPayment-500000).toBeCloseTo(r.totalInterest,5);
  });
  it('acepta 0 % de interés',()=>{
    const r=calculateLoan({amount:500000,annualRate:0,termMonths:36});
    expect(r.monthlyPayment).toBeCloseTo(13888.8889,3);
    expect(r.totalInterest).toBe(0);
  });
  it('rechaza montos, tasas y plazos inválidos',()=>{
    expect(()=>calculateLoan({amount:0,annualRate:10,termMonths:12})).toThrow();
    expect(()=>calculateLoan({amount:100,annualRate:-1,termMonths:12})).toThrow();
    expect(()=>calculateLoan({amount:100,annualRate:10,termMonths:601})).toThrow();
  });
  it('interpreta decimales sin ambigüedad',()=>{
    expect(parseDecimal('1200,50')).toBe(1200.5);
    expect(parseDecimal('1,200.50')).toBeNaN();
    expect(parseMonths('36')).toBe(36);
    expect(parseMonths('12.5')).toBeNaN();
  });
});
