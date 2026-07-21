import { Injectable } from '@angular/core';
import { AmortizationRow, LoanRequest, LoanResult } from '../models/loan.model';

@Injectable({ providedIn: 'root' })
export class LoanCalculatorService {
  private readonly storageKey = 'loanResult';
  private readonly historyKey = 'loanHistory';

  private get storage(): Storage | null {
    return typeof window !== 'undefined' ? window.localStorage : null;
  }

  calculate(request: LoanRequest): LoanResult {
    const monthlyRate = request.annualRate / 100 / 12;
    const monthlyPayment = monthlyRate === 0
      ? request.amount / request.termMonths
      : request.amount * (monthlyRate * Math.pow(1 + monthlyRate, request.termMonths)) /
        (Math.pow(1 + monthlyRate, request.termMonths) - 1);

    const amortization = this.buildAmortization(
      request.amount,
      monthlyRate,
      monthlyPayment,
      request.termMonths
    );

    const totalPayment = monthlyPayment * request.termMonths;

    return {
      request: { ...request },
      age: this.calculateAge(request.birthDate),
      monthlyPayment,
      totalPayment,
      totalInterest: totalPayment - request.amount,
      amortization
    };
  }

  saveResult(result: LoanResult): void {
    this.setCurrentResult(result);
    this.addToHistory(result);
  }

  setCurrentResult(result: LoanResult): void {
    this.storage?.setItem(this.storageKey, JSON.stringify(result));
  }

  getResult(): LoanResult | null {
    return this.read<LoanResult>(this.storageKey);
  }

  clearResult(): void {
    this.storage?.removeItem(this.storageKey);
  }

  getHistory(): LoanResult[] {
    return this.read<LoanResult[]>(this.historyKey) ?? [];
  }

  loadHistoryItem(index: number): LoanResult | null {
    const item = this.getHistory()[index] ?? null;
    if (item) this.setCurrentResult(item);
    return item;
  }

  removeHistoryItem(index: number): void {
    const history = this.getHistory().filter((_, itemIndex) => itemIndex !== index);
    this.storage?.setItem(this.historyKey, JSON.stringify(history));
  }

  clearHistory(): void {
    this.storage?.removeItem(this.historyKey);
  }

  private addToHistory(result: LoanResult): void {
    const fingerprint = this.fingerprint(result);
    const history = this.getHistory().filter(item => this.fingerprint(item) !== fingerprint);
    this.storage?.setItem(this.historyKey, JSON.stringify([result, ...history].slice(0, 20)));
  }

  private fingerprint(result: LoanResult): string {
    const request = result.request;
    return [
      request.documentId,
      request.amount,
      request.annualRate,
      request.termMonths,
      request.loanType
    ].join('|');
  }

  private read<T>(key: string): T | null {
    const raw = this.storage?.getItem(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      this.storage?.removeItem(key);
      return null;
    }
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
      const principal = Math.min(monthlyPayment - interest, balance);
      balance = Math.max(balance - principal, 0);
      const paymentDate = new Date(today.getFullYear(), today.getMonth() + i, today.getDate());

      rows.push({
        number: i,
        paymentDate: paymentDate.toLocaleDateString('es-DO'),
        payment: i === termMonths ? principal + interest : monthlyPayment,
        interest,
        principal,
        balance
      });
    }

    return rows;
  }

  private calculateAge(birthDate: string): number | null {
    if (!birthDate) return null;
    const [year, month, day] = birthDate.split('-').map(Number);
    if (!year || !month || !day) return null;

    const today = new Date();
    let age = today.getFullYear() - year;
    if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) {
      age--;
    }
    return age;
  }
}
