import { Injectable } from '@angular/core';
import { AmortizationRow, LoanRequest, LoanResult } from '../models/loan.model';

@Injectable({
  providedIn: 'root'
})
export class LoanCalculatorService {
  private readonly storageKey = 'loanResult';

  private get storage(): Storage | null {
    return typeof window !== 'undefined' ? window.localStorage : null;
  }

  calculate(request: LoanRequest): LoanResult {
    const monthlyRate = request.annualRate / 100 / 12;

    const monthlyPayment =
      request.amount *
      (monthlyRate * Math.pow(1 + monthlyRate, request.termMonths)) /
      (Math.pow(1 + monthlyRate, request.termMonths) - 1);

    const amortization = this.buildAmortization(
      request.amount,
      monthlyRate,
      monthlyPayment,
      request.termMonths
    );

    const totalPayment = monthlyPayment * request.termMonths;
    const totalInterest = totalPayment - request.amount;

    return {
      request,
      age: this.calculateAge(request.birthDate),
      monthlyPayment,
      totalPayment,
      totalInterest,
      amortization
    };
  }

  saveResult(result: LoanResult): void {
    this.storage?.setItem(this.storageKey, JSON.stringify(result));
  }

  getResult(): LoanResult | null {
    const raw = this.storage?.getItem(this.storageKey);

    return raw ? JSON.parse(raw) as LoanResult : null;
  }

  clearResult(): void {
    this.storage?.removeItem(this.storageKey);
  }

  private buildAmortization(
    amount: number,
    monthlyRate: number,
    monthlyPayment: number,
    termMonths: number
  ): AmortizationRow[] {
    const rows: AmortizationRow[] = [];
    let balance = amount;
    const today = new Date();

    for (let i = 1; i <= termMonths; i++) {
      const interest = balance * monthlyRate;
      const principal = monthlyPayment - interest;
      balance -= principal;

      const paymentDate = new Date(
        today.getFullYear(),
        today.getMonth() + i,
        today.getDate()
      );

      rows.push({
        number: i,
        paymentDate: paymentDate.toLocaleDateString('es-DO'),
        payment: monthlyPayment,
        interest,
        principal,
        balance: balance > 0 ? balance : 0
      });
    }

    return rows;
  }

  private calculateAge(birthDate: string): number | null {
    if (!birthDate) return null;

    const birth = new Date(birthDate);
    const today = new Date();

    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    return age;
  }
}