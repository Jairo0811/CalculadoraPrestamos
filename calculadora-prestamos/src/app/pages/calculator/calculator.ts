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
  submitted = false;
  showPersonalData = false;

  /** Campos numéricos vacíos por defecto (en lugar de mostrar "0"). */
  annualRate: number | null = null;
  termMonths: number | null = null;

  readonly maxAmount = 1_000_000_000;
  readonly maxAnnualRate = 100;
  readonly maxTermMonths = 600;
  readonly termPresets = [12, 24, 36, 48, 60, 120, 240];

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

  /** La cédula es opcional: solo se valida si el usuario decide escribirla. */
  get hasCedula(): boolean {
    return this.cedulaDigits.length > 0;
  }

  get showCedulaValidation(): boolean {
    return this.hasCedula && (this.cedulaTouched || this.cedulaIsComplete);
  }

  get amountError(): string | null {
    if (!this.submitted) return null;
    if (!(this.request.amount > 0)) return 'Indica el monto que deseas financiar.';
    if (this.request.amount > this.maxAmount) return 'El monto no puede superar RD$ 1,000,000,000.';
    return null;
  }

  get loanTypeError(): string | null {
    return this.submitted && !this.request.loanType ? 'Selecciona el tipo de préstamo.' : null;
  }

  get rateError(): string | null {
    if (!this.submitted) return null;
    const rate = this.annualRate;
    if (rate === null || !Number.isFinite(rate)) return 'Indica una tasa anual válida.';
    if (rate < 0) return 'La tasa anual no puede ser negativa.';
    if (rate > this.maxAnnualRate) return 'La tasa anual no puede superar el 100 %.';
    return null;
  }

  get termError(): string | null {
    if (!this.submitted) return null;
    const term = this.termMonths;
    if (term === null || !Number.isInteger(term) || term <= 0) return 'Indica el plazo en meses (número entero).';
    if (term > this.maxTermMonths) return 'El plazo no puede superar 600 meses (50 años).';
    return null;
  }

  get monthlyRateHint(): string | null {
    const rate = this.annualRate;
    return rate && rate > 0 && rate <= this.maxAnnualRate
      ? `Equivale a ${(rate / 12).toFixed(3)} % mensual en el método francés.`
      : null;
  }

  get termHint(): string | null {
    const term = this.termMonths;
    if (!term || term <= 0 || !Number.isInteger(term)) return null;
    const years = Math.floor(term / 12);
    const months = term % 12;
    const parts = [years ? `${years} ${years === 1 ? 'año' : 'años'}` : '', months ? `${months} ${months === 1 ? 'mes' : 'meses'}` : ''];
    return parts.filter(Boolean).join(' y ');
  }

  selectTerm(months: number): void {
    this.termMonths = months;
    this.errorMessage = '';
  }

  calculate(): void {
    this.errorMessage = '';
    this.submitted = true;
    this.syncAmountFromDisplay();
    this.cedulaTouched = true;

    if (this.amountError || this.loanTypeError || this.rateError || this.termError) {
      this.errorMessage = 'Revisa los campos marcados para generar la simulación.';
      this.focusFirstInvalid();
      return;
    }

    if (this.hasCedula && !this.cedulaIsComplete) {
      this.showPersonalData = true;
      this.errorMessage = 'La cédula debe contener exactamente 11 dígitos, o déjala vacía.';
      return;
    }

    if (this.hasCedula && !this.cedulaIsValid) {
      this.showPersonalData = true;
      this.errorMessage = 'La cédula introducida no es válida. Corrígela o déjala vacía: es opcional.';
      return;
    }

    this.request.annualRate = this.annualRate!;
    this.request.termMonths = this.termMonths!;
    this.request.firstName = this.request.firstName.trim();
    this.request.lastName = this.request.lastName.trim();
    this.request.documentId = this.hasCedula ? this.formatCedula(this.request.documentId) : '';

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
    this.annualRate = null;
    this.termMonths = null;
    this.errorMessage = '';
    this.submitted = false;
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

  private focusFirstInvalid(): void {
    if (typeof document === 'undefined') return;
    // Tras el siguiente render, cuando los campos ya tienen aria-invalid.
    setTimeout(() => document.querySelector<HTMLElement>('.calculator-wrapper [aria-invalid="true"]')?.focus());
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
