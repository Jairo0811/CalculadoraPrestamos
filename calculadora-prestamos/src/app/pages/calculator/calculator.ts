import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LoanCalculatorService } from '../../core/services/loan-calculator';
import { LoanRequest } from '../../core/models/loan.model';

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

  calculate(): void {
    this.errorMessage = '';

    if (!this.isValidRequest()) {
      this.errorMessage =
        'Completa todos los campos obligatorios. La cédula debe contener 11 dígitos.';
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

    this.errorMessage = '';
    this.loanCalculator.clearResult();
  }

  formatCedulaInput(): void {
    this.request.documentId = this.formatCedula(this.request.documentId);
  }

  private isValidRequest(): boolean {
    const cedula = this.request.documentId.replace(/\D/g, '');

    return Boolean(
      this.request.firstName.trim() &&
        this.request.lastName.trim() &&
        cedula.length === 11 &&
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