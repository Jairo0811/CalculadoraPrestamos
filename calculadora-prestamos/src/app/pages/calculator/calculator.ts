import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LoanCalculatorService } from '../../core/services/loan-calculator';
import { LoanRequest } from '../../core/models/loan.model';
import { isValidDominicanId } from '../../core/validators/dominican-id.validator';

@Component({
  selector: 'app-calculator',
  imports: [FormsModule],
  templateUrl: './calculator.html',
  styleUrl: './calculator.css'
})
export class Calculator {
  private readonly router = inject(Router);
  private readonly loanCalculator = inject(LoanCalculatorService);

  errorMessage = '';
  cedulaTouched = false;
  amountDisplay = '';

  request: LoanRequest = {
    firstName: '',
    lastName: '',
    birthDate: '',
    documentId: '',
    amount: 0,
    annualRate: 0,
    termMonths: 0,
    loanType: ''
  };

  loanTypes = ['Personal', 'Hipotecario', 'Vehículo', 'Educativo', 'Comercial'];

  get cedulaDigits(): string {
    return this.request.documentId.replace(/\D/g, '');
  }

  get cedulaIsComplete(): boolean {
    return this.cedulaDigits.length === 11;
  }

  get cedulaIsValid(): boolean {
    return isValidDominicanId(this.request.documentId);
  }

  get showCedulaValidation(): boolean {
    return this.cedulaTouched || this.cedulaIsComplete;
  }

  calculate(): void {
    this.errorMessage = '';
    this.syncAmountFromDisplay();
    this.cedulaTouched = true;

    if (!this.hasRequiredFields()) {
      this.errorMessage = 'Completa todos los campos obligatorios para generar la simulación.';
      return;
    }

    if (!this.cedulaIsComplete) {
      this.errorMessage = 'La cédula debe contener exactamente 11 dígitos.';
      return;
    }

    if (!this.cedulaIsValid) {
      this.errorMessage = 'La cédula introducida no es válida. Verifica el número e inténtalo nuevamente.';
      return;
    }

    this.request.documentId = this.formatCedula(this.request.documentId);

    const result = this.loanCalculator.calculate(this.request);
    this.loanCalculator.saveResult(result);
    this.router.navigate(['/results']);
  }

  clear(): void {
    this.request = {
      firstName: '',
      lastName: '',
      birthDate: '',
      documentId: '',
      amount: 0,
      annualRate: 0,
      termMonths: 0,
      loanType: ''
    };

    this.amountDisplay = '';
    this.errorMessage = '';
    this.cedulaTouched = false;
    this.loanCalculator.clearResult();
  }

  formatCedulaInput(): void {
    this.request.documentId = this.formatCedula(this.request.documentId);
    this.errorMessage = '';
  }

  markCedulaAsTouched(): void {
    this.cedulaTouched = true;
  }

  handleAmountInput(value: string): void {
    const normalized = value
      .replace(/,/g, '')
      .replace(/[^\d.]/g, '');

    const firstDecimalPoint = normalized.indexOf('.');
    const integerPart = (
      firstDecimalPoint >= 0
        ? normalized.slice(0, firstDecimalPoint)
        : normalized
    ).replace(/^0+(?=\d)/, '');

    const decimalPart =
      firstDecimalPoint >= 0
        ? normalized
            .slice(firstDecimalPoint + 1)
            .replace(/\./g, '')
            .slice(0, 2)
        : null;

    const numericInteger = Number(integerPart || '0');
    const formattedInteger = Number.isFinite(numericInteger)
      ? new Intl.NumberFormat('en-US', {
          maximumFractionDigits: 0
        }).format(numericInteger)
      : '';

    this.amountDisplay =
      decimalPart !== null
        ? `${formattedInteger}.${decimalPart}`
        : formattedInteger;

    this.syncAmountFromDisplay();
    this.errorMessage = '';
  }

  formatAmountOnBlur(): void {
    this.syncAmountFromDisplay();

    this.amountDisplay =
      this.request.amount > 0
        ? new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
          }).format(this.request.amount)
        : '';
  }

  private syncAmountFromDisplay(): void {
    const amount = Number(
      this.amountDisplay.replace(/,/g, '').trim()
    );

    this.request.amount = Number.isFinite(amount) ? amount : 0;
  }

  private hasRequiredFields(): boolean {
    return Boolean(
      this.request.firstName.trim() &&
        this.request.lastName.trim() &&
        this.request.loanType &&
        this.request.amount > 0 &&
        this.request.annualRate > 0 &&
        this.request.termMonths > 0
    );
  }

  private formatCedula(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 11);

    if (digits.length <= 3) {
      return digits;
    }

    if (digits.length <= 10) {
      return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    }

    return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`;
  }
}
