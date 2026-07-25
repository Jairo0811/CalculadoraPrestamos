import { Injectable } from '@angular/core';
import {
  AmortizationRow,
  ExtraPaymentAmortizationRow,
  ExtraPaymentRequest,
  ExtraPaymentResult,
  LoanRequest,
  LoanResult
} from '../models/loan.model';

@Injectable({ providedIn: 'root' })
export class LoanCalculatorService {
  private readonly storageKey = 'loanResult';
  private readonly historyKey = 'loanHistory';
  private readonly balanceTolerance = 0.01;

  private get storage(): Storage | null {
    return typeof window !== 'undefined' ? window.localStorage : null;
  }

  calculate(request: LoanRequest): LoanResult {
    this.validateLoanRequest(request);

    const monthlyRate = this.getMonthlyRate(request.annualRate);
    const monthlyPayment = this.calculateMonthlyPayment(
      request.amount,
      monthlyRate,
      request.termMonths
    );

    const amortization = this.buildAmortization(
      request.amount,
      monthlyRate,
      monthlyPayment,
      request.termMonths
    );

    const totalPayment = amortization.reduce(
      (total, row) => total + row.payment,
      0
    );

    const totalInterest = amortization.reduce(
      (total, row) => total + row.interest,
      0
    );

    return {
      request: { ...request },
      age: this.calculateAge(request.birthDate),
      monthlyPayment,
      totalPayment,
      totalInterest,
      amortization
    };
  }

  calculateExtraPaymentScenario(
    request: ExtraPaymentRequest
  ): ExtraPaymentResult {
    this.validateExtraPaymentRequest(request);

    const originalResult = this.calculate(request.loan);
    const monthlyRate = this.getMonthlyRate(request.loan.annualRate);

    let balance = request.loan.amount;
    let regularPayment = originalResult.monthlyPayment;
    let totalInterest = 0;
    let totalPayment = 0;
    let totalExtraPayments = 0;
    let month = 1;

    const amortization: ExtraPaymentAmortizationRow[] = [];
    const maximumIterations = Math.max(
      request.loan.termMonths * 2,
      request.loan.termMonths + 600
    );

    while (
      balance > this.balanceTolerance &&
      month <= maximumIterations
    ) {
      const interest = balance * monthlyRate;

      const scheduledPrincipal = Math.min(
        Math.max(regularPayment - interest, 0),
        balance
      );

      const requestedExtraPayment = this.getExtraPaymentForMonth(
        request,
        month
      );

      const maximumExtraPayment = Math.max(
        balance - scheduledPrincipal,
        0
      );

      const extraPayment = Math.min(
        requestedExtraPayment,
        maximumExtraPayment
      );

      const principal = Math.min(
        scheduledPrincipal + extraPayment,
        balance
      );

      const payment = interest + principal;

      balance = Math.max(balance - principal, 0);

      totalInterest += interest;
      totalPayment += payment;
      totalExtraPayments += extraPayment;

      amortization.push({
        number: month,
        paymentDate: this.getPaymentDate(month),
        regularPayment: interest + scheduledPrincipal,
        extraPayment,
        payment,
        interest,
        principal,
        balance
      });

      if (
        request.strategy === 'reduce-payment' &&
        extraPayment > 0 &&
        balance > this.balanceTolerance
      ) {
        const remainingMonths = Math.max(
          request.loan.termMonths - month,
          1
        );

        regularPayment = this.calculateMonthlyPayment(
          balance,
          monthlyRate,
          remainingMonths
        );
      }

      month++;
    }

    if (balance > this.balanceTolerance) {
      throw new Error(
        'No fue posible completar la simulación de abonos extraordinarios.'
      );
    }

    const newTermMonths = amortization.length;
    const monthsSaved = Math.max(
      originalResult.request.termMonths - newTermMonths,
      0
    );

    const interestSaved = Math.max(
      originalResult.totalInterest - totalInterest,
      0
    );

    return {
      request: {
        ...request,
        loan: { ...request.loan }
      },

      originalResult,

      newMonthlyPayment:
        amortization[0]?.regularPayment ??
        originalResult.monthlyPayment,

      finalMonthlyPayment:
        amortization.at(-1)?.regularPayment ??
        originalResult.monthlyPayment,

      originalTermMonths: originalResult.request.termMonths,
      newTermMonths,
      monthsSaved,

      originalTotalInterest: originalResult.totalInterest,
      newTotalInterest: totalInterest,
      interestSaved,

      originalTotalPayment: originalResult.totalPayment,
      newTotalPayment: totalPayment,
      totalExtraPayments,

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

    if (item) {
      this.setCurrentResult(item);
    }

    return item;
  }

  removeHistoryItem(index: number): void {
    const history = this.getHistory().filter(
      (_, itemIndex) => itemIndex !== index
    );

    this.storage?.setItem(
      this.historyKey,
      JSON.stringify(history)
    );
  }

  clearHistory(): void {
    this.storage?.removeItem(this.historyKey);
  }

  private addToHistory(result: LoanResult): void {
    const fingerprint = this.fingerprint(result);

    const history = this.getHistory().filter(
      item => this.fingerprint(item) !== fingerprint
    );

    this.storage?.setItem(
      this.historyKey,
      JSON.stringify([result, ...history].slice(0, 20))
    );
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

    if (!raw) {
      return null;
    }

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

    for (let month = 1; month <= termMonths; month++) {
      const interest = balance * monthlyRate;

      const principal = Math.min(
        Math.max(monthlyPayment - interest, 0),
        balance
      );

      balance = Math.max(balance - principal, 0);

      rows.push({
        number: month,
        paymentDate: this.getPaymentDate(month),
        payment:
          month === termMonths
            ? principal + interest
            : monthlyPayment,
        interest,
        principal,
        balance
      });
    }

    return rows;
  }

  private calculateMonthlyPayment(
    amount: number,
    monthlyRate: number,
    termMonths: number
  ): number {
    if (termMonths <= 0) {
      throw new Error(
        'El plazo del préstamo debe ser mayor que cero.'
      );
    }

    if (monthlyRate === 0) {
      return amount / termMonths;
    }

    const accumulatedRate = Math.pow(
      1 + monthlyRate,
      termMonths
    );

    return (
      amount *
      ((monthlyRate * accumulatedRate) /
        (accumulatedRate - 1))
    );
  }

  private getMonthlyRate(annualRate: number): number {
    return annualRate / 100 / 12;
  }

  private getExtraPaymentForMonth(
    request: ExtraPaymentRequest,
    month: number
  ): number {
    if (request.frequency === 'single') {
      return month === request.startMonth
        ? request.amount
        : 0;
    }

    return month >= request.startMonth
      ? request.amount
      : 0;
  }

  private getPaymentDate(month: number): string {
    const today = new Date();

    const paymentDate = new Date(
      today.getFullYear(),
      today.getMonth() + month,
      today.getDate()
    );

    return paymentDate.toLocaleDateString('es-DO');
  }

  private validateLoanRequest(request: LoanRequest): void {
    if (!Number.isFinite(request.amount) || request.amount <= 0) {
      throw new Error(
        'El monto del préstamo debe ser mayor que cero.'
      );
    }

    if (
      !Number.isFinite(request.annualRate) ||
      request.annualRate < 0
    ) {
      throw new Error(
        'La tasa anual no puede ser negativa.'
      );
    }

    if (
      !Number.isInteger(request.termMonths) ||
      request.termMonths <= 0
    ) {
      throw new Error(
        'El plazo debe ser una cantidad válida de meses.'
      );
    }
  }

  private validateExtraPaymentRequest(
    request: ExtraPaymentRequest
  ): void {
    this.validateLoanRequest(request.loan);

    if (!Number.isFinite(request.amount) || request.amount <= 0) {
      throw new Error(
        'El abono extraordinario debe ser mayor que cero.'
      );
    }

    if (
      !Number.isInteger(request.startMonth) ||
      request.startMonth < 1 ||
      request.startMonth > request.loan.termMonths
    ) {
      throw new Error(
        'El mes de inicio del abono debe estar dentro del plazo original.'
      );
    }

    if (
      request.frequency !== 'single' &&
      request.frequency !== 'monthly'
    ) {
      throw new Error(
        'La frecuencia seleccionada no es válida.'
      );
    }

    if (
      request.strategy !== 'reduce-term' &&
      request.strategy !== 'reduce-payment'
    ) {
      throw new Error(
        'La estrategia de aplicación del abono no es válida.'
      );
    }
  }

  private calculateAge(birthDate: string): number | null {
    if (!birthDate) {
      return null;
    }

    const [year, month, day] = birthDate
      .split('-')
      .map(Number);

    if (!year || !month || !day) {
      return null;
    }

    const today = new Date();
    let age = today.getFullYear() - year;

    const hasNotHadBirthday =
      today.getMonth() + 1 < month ||
      (
        today.getMonth() + 1 === month &&
        today.getDate() < day
      );

    if (hasNotHadBirthday) {
      age--;
    }

    return age;
  }
}