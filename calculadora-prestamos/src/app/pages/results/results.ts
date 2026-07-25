import { CurrencyPipe, DecimalPipe, NgClass } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

import {
  ExtraPaymentFrequency,
  ExtraPaymentResult,
  ExtraPaymentStrategy,
  LoanResult,
} from '../../core/models/loan.model';
import { LoanCalculatorService } from '../../core/services/loan-calculator';

interface ComparisonOption {
  name: string;
  annualRate: number;
  monthlyPayment: number;
  totalInterest: number;
  totalPayment: number;
}

@Component({
  selector: 'app-results',
  imports: [CurrencyPipe, DecimalPipe, NgClass, RouterLink, FormsModule],
  templateUrl: './results.html',
  styleUrl: './results.css',
})
export class Results {
  private readonly router = inject(Router);
  private readonly loanCalculator = inject(LoanCalculatorService);

  result: LoanResult | null = this.loanCalculator.getResult();
  history: LoanResult[] = this.loanCalculator.getHistory();

  shareFeedback = '';

  extraPaymentAmount: number | null = null;
  extraPaymentStartMonth = 1;
  extraPaymentFrequency: ExtraPaymentFrequency = 'single';
  extraPaymentStrategy: ExtraPaymentStrategy = 'reduce-term';
  extraPaymentResult: ExtraPaymentResult | null = null;
  extraPaymentError = '';

  bankRates = [
    { name: 'Banco Popular', annualRate: 18.5 },
    { name: 'Banreservas', annualRate: 17.75 },
    { name: 'Banco BHD', annualRate: 19.25 },
    { name: 'APAP', annualRate: 18.0 },
  ];

  constructor() {
    if (!this.result) {
      void this.router.navigate(['/calculator']);
      return;
    }

    this.extraPaymentStartMonth = Math.min(12, this.result.request.termMonths);
  }

  get comparisons(): ComparisonOption[] {
    if (!this.result) {
      return [];
    }

    return this.bankRates
      .map((bank) => {
        const simulated = this.loanCalculator.calculate({
          ...this.result!.request,
          annualRate: Number(bank.annualRate),
        });

        return {
          name: bank.name,
          annualRate: Number(bank.annualRate),
          monthlyPayment: simulated.monthlyPayment,
          totalInterest: simulated.totalInterest,
          totalPayment: simulated.totalPayment,
        };
      })
      .sort((a, b) => a.totalPayment - b.totalPayment);
  }

  get chartPoints(): string {
    if (!this.result?.amortization.length) {
      return '';
    }

    const rows = this.result.amortization;
    const maximumBalance = Math.max(...rows.map((row) => row.balance), 1);

    return rows
      .map((row, index) => {
        const x = (index / Math.max(rows.length - 1, 1)) * 100;

        const y = 100 - (row.balance / maximumBalance) * 100;

        return `${x},${y}`;
      })
      .join(' ');
  }

  get principalPercentage(): number {
    if (!this.result?.totalPayment) {
      return 0;
    }

    return (this.result.request.amount / this.result.totalPayment) * 100;
  }

  get interestPercentage(): number {
    return 100 - this.principalPercentage;
  }

  get interestOverCapitalPercentage(): number {
    if (!this.result?.request.amount) {
      return 0;
    }

    return (this.result.totalInterest / this.result.request.amount) * 100;
  }

  get averageMonthlyInterest(): number {
    if (!this.result?.request.termMonths) {
      return 0;
    }

    return this.result.totalInterest / this.result.request.termMonths;
  }

  get averageAnnualInterest(): number {
    return this.averageMonthlyInterest * 12;
  }

  get loanScore(): string {
    const percentage = this.interestOverCapitalPercentage;

    if (percentage <= 15) return 'A+';
    if (percentage <= 25) return 'A';
    if (percentage <= 40) return 'B';
    if (percentage <= 60) return 'C';
    return 'D';
  }

  get loanScoreDescription(): string {
    switch (this.loanScore) {
      case 'A+':
        return 'Costo financiero excelente';
      case 'A':
        return 'Costo financiero favorable';
      case 'B':
        return 'Costo financiero moderado';
      case 'C':
        return 'Costo financiero elevado';
      default:
        return 'Costo financiero muy elevado';
    }
  }

  get loanScoreClass(): string {
    switch (this.loanScore) {
      case 'A+':
      case 'A':
        return 'score-good';
      case 'B':
        return 'score-medium';
      default:
        return 'score-high';
    }
  }

  get financialRecommendations(): string[] {
    if (!this.result) {
      return [];
    }

    const recommendations: string[] = [];
    const interestPercentage = this.interestOverCapitalPercentage;
    const termMonths = this.result.request.termMonths;
    const annualRate = this.result.request.annualRate;

    if (interestPercentage > 60) {
      recommendations.push(
        'El interés supera el 60% del capital. Conviene evaluar una tasa menor o reducir el plazo.',
      );
    } else if (interestPercentage > 40) {
      recommendations.push(
        'El costo financiero es elevado. Un abono extraordinario podría reducir significativamente los intereses.',
      );
    } else if (interestPercentage > 25) {
      recommendations.push(
        'El préstamo tiene un costo moderado. Compara otras tasas antes de tomar una decisión.',
      );
    } else {
      recommendations.push(
        'La relación entre interés y capital es favorable para el plazo seleccionado.',
      );
    }

    if (termMonths >= 60) {
      recommendations.push(
        'Los plazos largos reducen la cuota, pero aumentan el interés total. Considera un plazo menor si tu presupuesto lo permite.',
      );
    }

    if (annualRate >= 20) {
      recommendations.push(
        'La tasa anual es alta. Negociar uno o dos puntos porcentuales puede generar un ahorro importante.',
      );
    }

    if (this.extraPaymentResult?.interestSaved) {
      recommendations.push(
        `El escenario de abonos extraordinarios ahorra ${this.money(
          this.extraPaymentResult.interestSaved,
        )} en intereses.`,
      );
    } else {
      recommendations.push(
        'Prueba el simulador de abonos extraordinarios para identificar oportunidades de ahorro.',
      );
    }

    return recommendations.slice(0, 4);
  }

  get loanTimelineItems(): Array<{
    title: string;
    detail: string;
    icon: string;
    accent: boolean;
  }> {
    if (!this.result) {
      return [];
    }

    const items = [
      {
        title: 'Inicio',
        detail: 'Desembolso estimado del préstamo',
        icon: 'bi-cash-coin',
        accent: false,
      },
    ];

    if (this.extraPaymentResult) {
      items.push({
        title: `Mes ${this.extraPaymentResult.request.startMonth}`,
        detail:
          this.extraPaymentResult.request.frequency === 'monthly'
            ? 'Inicio de los abonos mensuales'
            : 'Aplicación del abono extraordinario',
        icon: 'bi-piggy-bank',
        accent: true,
      });
    }

    items.push({
      title: `Mes ${this.extraPaymentResult?.newTermMonths ?? this.result.request.termMonths}`,
      detail: this.extraPaymentResult
        ? 'Liquidación estimada con abonos'
        : 'Liquidación estimada del préstamo',
      icon: 'bi-flag',
      accent: true,
    });

    return items;
  }

  get extraPaymentInterestReductionPercentage(): number {
    const result = this.extraPaymentResult;

    if (!result || result.originalTotalInterest <= 0) {
      return 0;
    }

    return Math.min((result.interestSaved / result.originalTotalInterest) * 100, 100);
  }

  get extraPaymentTermReductionPercentage(): number {
    const result = this.extraPaymentResult;

    if (!result || result.originalTermMonths <= 0) {
      return 0;
    }

    return Math.min((result.monthsSaved / result.originalTermMonths) * 100, 100);
  }

  get extraPaymentNewInterestPercentage(): number {
    const result = this.extraPaymentResult;

    if (!result || result.originalTotalInterest <= 0) {
      return 0;
    }

    return Math.min((result.newTotalInterest / result.originalTotalInterest) * 100, 100);
  }

  get extraPaymentNewTermPercentage(): number {
    const result = this.extraPaymentResult;

    if (!result || result.originalTermMonths <= 0) {
      return 0;
    }

    return Math.min((result.newTermMonths / result.originalTermMonths) * 100, 100);
  }

  calculateExtraPayment(): void {
    this.extraPaymentError = '';
    this.extraPaymentResult = null;

    if (!this.result) {
      return;
    }

    const amount = Number(this.extraPaymentAmount);
    const startMonth = Number(this.extraPaymentStartMonth);

    if (!Number.isFinite(amount) || amount <= 0) {
      this.extraPaymentError = 'Ingresa un monto de abono mayor que cero.';
      return;
    }

    if (
      !Number.isInteger(startMonth) ||
      startMonth < 1 ||
      startMonth > this.result.request.termMonths
    ) {
      this.extraPaymentError = 'El mes de aplicación debe estar dentro del plazo original.';
      return;
    }

    try {
      this.extraPaymentResult = this.loanCalculator.calculateExtraPaymentScenario({
        loan: { ...this.result.request },
        amount,
        startMonth,
        frequency: this.extraPaymentFrequency,
        strategy: this.extraPaymentStrategy,
      });
    } catch (error: unknown) {
      this.extraPaymentError =
        error instanceof Error ? error.message : 'No fue posible calcular el escenario de abono.';
    }
  }

  clearExtraPaymentScenario(): void {
    this.extraPaymentResult = null;
    this.extraPaymentError = '';
    this.extraPaymentAmount = null;

    if (this.result) {
      this.extraPaymentStartMonth = Math.min(12, this.result.request.termMonths);
    }

    this.extraPaymentFrequency = 'single';
    this.extraPaymentStrategy = 'reduce-term';
  }

  exportExtraPaymentPdf(): void {
    if (!this.result || !this.extraPaymentResult) {
      return;
    }

    void this.generateExtraPaymentPdf(this.result, this.extraPaymentResult);
  }

  exportExtraPaymentExcel(): void {
    if (!this.result || !this.extraPaymentResult || typeof document === 'undefined') {
      return;
    }

    const loanResult = this.result;
    const extraResult = this.extraPaymentResult;

    const summaryRows = `
    <Row>
      <Cell><Data ss:Type="String">LoanCalc RD</Data></Cell>
      <Cell><Data ss:Type="String">Simulación de abonos extraordinarios</Data></Cell>
    </Row>

    <Row>
      <Cell><Data ss:Type="String">Cliente</Data></Cell>
      <Cell><Data ss:Type="String">${this.escapeXml(this.clientName(loanResult))}</Data></Cell>
    </Row>

    <Row>
      <Cell><Data ss:Type="String">Tipo de préstamo</Data></Cell>
      <Cell><Data ss:Type="String">${this.escapeXml(loanResult.request.loanType)}</Data></Cell>
    </Row>

    <Row>
      <Cell><Data ss:Type="String">Monto original</Data></Cell>
      <Cell><Data ss:Type="Number">${loanResult.request.amount}</Data></Cell>
    </Row>

    <Row>
      <Cell><Data ss:Type="String">Tasa anual</Data></Cell>
      <Cell><Data ss:Type="Number">${loanResult.request.annualRate}</Data></Cell>
    </Row>

    <Row>
      <Cell><Data ss:Type="String">Monto del abono</Data></Cell>
      <Cell><Data ss:Type="Number">${extraResult.request.amount}</Data></Cell>
    </Row>

    <Row>
      <Cell><Data ss:Type="String">Mes de aplicación</Data></Cell>
      <Cell><Data ss:Type="Number">${extraResult.request.startMonth}</Data></Cell>
    </Row>

    <Row>
      <Cell><Data ss:Type="String">Frecuencia</Data></Cell>
      <Cell><Data ss:Type="String">${this.extraPaymentFrequencyLabel(
        extraResult.request.frequency,
      )}</Data></Cell>
    </Row>

    <Row>
      <Cell><Data ss:Type="String">Estrategia</Data></Cell>
      <Cell><Data ss:Type="String">${this.extraPaymentStrategyLabel(
        extraResult.request.strategy,
      )}</Data></Cell>
    </Row>

    <Row>
      <Cell><Data ss:Type="String">Total abonado extraordinariamente</Data></Cell>
      <Cell><Data ss:Type="Number">${extraResult.totalExtraPayments}</Data></Cell>
    </Row>
  `;

    const comparisonRows = `
    <Row>
      <Cell><Data ss:Type="String">Indicador</Data></Cell>
      <Cell><Data ss:Type="String">Escenario original</Data></Cell>
      <Cell><Data ss:Type="String">Nuevo escenario</Data></Cell>
      <Cell><Data ss:Type="String">Ahorro</Data></Cell>
    </Row>

    <Row>
      <Cell><Data ss:Type="String">Plazo en meses</Data></Cell>
      <Cell><Data ss:Type="Number">${extraResult.originalTermMonths}</Data></Cell>
      <Cell><Data ss:Type="Number">${extraResult.newTermMonths}</Data></Cell>
      <Cell><Data ss:Type="Number">${extraResult.monthsSaved}</Data></Cell>
    </Row>

    <Row>
      <Cell><Data ss:Type="String">Interés total</Data></Cell>
      <Cell><Data ss:Type="Number">${extraResult.originalTotalInterest}</Data></Cell>
      <Cell><Data ss:Type="Number">${extraResult.newTotalInterest}</Data></Cell>
      <Cell><Data ss:Type="Number">${extraResult.interestSaved}</Data></Cell>
    </Row>

    <Row>
      <Cell><Data ss:Type="String">Total a pagar</Data></Cell>
      <Cell><Data ss:Type="Number">${extraResult.originalTotalPayment}</Data></Cell>
      <Cell><Data ss:Type="Number">${extraResult.newTotalPayment}</Data></Cell>
      <Cell><Data ss:Type="Number">${Math.max(
        extraResult.originalTotalPayment - extraResult.newTotalPayment,
        0,
      )}</Data></Cell>
    </Row>

    <Row>
      <Cell><Data ss:Type="String">Cuota mensual</Data></Cell>
      <Cell><Data ss:Type="Number">${extraResult.originalResult.monthlyPayment}</Data></Cell>
      <Cell><Data ss:Type="Number">${extraResult.finalMonthlyPayment}</Data></Cell>
      <Cell><Data ss:Type="Number">${Math.max(
        extraResult.originalResult.monthlyPayment - extraResult.finalMonthlyPayment,
        0,
      )}</Data></Cell>
    </Row>
  `;

    const amortizationRows = extraResult.amortization
      .map(
        (row) => `
        <Row>
          <Cell><Data ss:Type="Number">${row.number}</Data></Cell>
          <Cell><Data ss:Type="String">${this.escapeXml(row.paymentDate)}</Data></Cell>
          <Cell><Data ss:Type="Number">${row.regularPayment}</Data></Cell>
          <Cell><Data ss:Type="Number">${row.extraPayment}</Data></Cell>
          <Cell><Data ss:Type="Number">${row.payment}</Data></Cell>
          <Cell><Data ss:Type="Number">${row.interest}</Data></Cell>
          <Cell><Data ss:Type="Number">${row.principal}</Data></Cell>
          <Cell><Data ss:Type="Number">${row.balance}</Data></Cell>
        </Row>
      `,
      )
      .join('');

    const workbook = `<?xml version="1.0"?>
    <?mso-application progid="Excel.Sheet"?>

    <Workbook
      xmlns="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
    >
      <Styles>
        <Style ss:ID="Header">
          <Font ss:Bold="1" ss:Color="#FFFFFF" />
          <Interior ss:Color="#0D6EFD" ss:Pattern="Solid" />
        </Style>

        <Style ss:ID="ExtraPayment">
          <Font ss:Bold="1" ss:Color="#198754" />
          <Interior ss:Color="#E8F5EE" ss:Pattern="Solid" />
        </Style>
      </Styles>

      <Worksheet ss:Name="Resumen">
        <Table>
          ${summaryRows}
        </Table>
      </Worksheet>

      <Worksheet ss:Name="Comparación">
        <Table>
          ${comparisonRows}
        </Table>
      </Worksheet>

      <Worksheet ss:Name="Amortización">
        <Table>
          <Row ss:StyleID="Header">
            <Cell><Data ss:Type="String">No.</Data></Cell>
            <Cell><Data ss:Type="String">Fecha</Data></Cell>
            <Cell><Data ss:Type="String">Cuota regular</Data></Cell>
            <Cell><Data ss:Type="String">Abono extra</Data></Cell>
            <Cell><Data ss:Type="String">Pago total</Data></Cell>
            <Cell><Data ss:Type="String">Interés</Data></Cell>
            <Cell><Data ss:Type="String">Capital total</Data></Cell>
            <Cell><Data ss:Type="String">Balance</Data></Cell>
          </Row>

          ${amortizationRows}
        </Table>
      </Worksheet>
    </Workbook>`;

    this.downloadBlob(
      new Blob([workbook], {
        type: 'application/vnd.ms-excel;charset=utf-8',
      }),
      `LoanCalcRD-Abonos-${this.dateKey()}.xls`,
    );
  }

  print(): void {
    if (this.result) {
      void this.generatePdf(this.result);
    }
  }

  exportExcel(): void {
    if (!this.result || typeof document === 'undefined') {
      return;
    }

    const result = this.result;

    const rows = result.amortization
      .map(
        (row) => `
        <Row>
          <Cell><Data ss:Type="Number">${row.number}</Data></Cell>
          <Cell><Data ss:Type="String">${this.escapeXml(row.paymentDate)}</Data></Cell>
          <Cell><Data ss:Type="Number">${row.payment}</Data></Cell>
          <Cell><Data ss:Type="Number">${row.interest}</Data></Cell>
          <Cell><Data ss:Type="Number">${row.principal}</Data></Cell>
          <Cell><Data ss:Type="Number">${row.balance}</Data></Cell>
        </Row>`,
      )
      .join('');

    const workbook = `<?xml version="1.0"?>
      <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
        xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
        <Worksheet ss:Name="Resumen">
          <Table>
            <Row>
              <Cell><Data ss:Type="String">LoanCalc RD</Data></Cell>
            </Row>
            <Row>
              <Cell><Data ss:Type="String">Cliente</Data></Cell>
              <Cell><Data ss:Type="String">${this.escapeXml(this.clientName(result))}</Data></Cell>
            </Row>
            <Row>
              <Cell><Data ss:Type="String">Tipo</Data></Cell>
              <Cell><Data ss:Type="String">${this.escapeXml(result.request.loanType)}</Data></Cell>
            </Row>
            <Row>
              <Cell><Data ss:Type="String">Monto</Data></Cell>
              <Cell><Data ss:Type="Number">${result.request.amount}</Data></Cell>
            </Row>
            <Row>
              <Cell><Data ss:Type="String">Cuota mensual</Data></Cell>
              <Cell><Data ss:Type="Number">${result.monthlyPayment}</Data></Cell>
            </Row>
            <Row>
              <Cell><Data ss:Type="String">Interés total</Data></Cell>
              <Cell><Data ss:Type="Number">${result.totalInterest}</Data></Cell>
            </Row>
            <Row>
              <Cell><Data ss:Type="String">Total a pagar</Data></Cell>
              <Cell><Data ss:Type="Number">${result.totalPayment}</Data></Cell>
            </Row>
          </Table>
        </Worksheet>

        <Worksheet ss:Name="Amortización">
          <Table>
            <Row>
              <Cell><Data ss:Type="String">No.</Data></Cell>
              <Cell><Data ss:Type="String">Fecha</Data></Cell>
              <Cell><Data ss:Type="String">Cuota</Data></Cell>
              <Cell><Data ss:Type="String">Interés</Data></Cell>
              <Cell><Data ss:Type="String">Capital</Data></Cell>
              <Cell><Data ss:Type="String">Balance</Data></Cell>
            </Row>
            ${rows}
          </Table>
        </Worksheet>
      </Workbook>`;

    this.downloadBlob(
      new Blob([workbook], {
        type: 'application/vnd.ms-excel;charset=utf-8',
      }),
      `LoanCalcRD-${this.dateKey()}.xls`,
    );
  }

  loadSimulation(index: number): void {
    const item = this.loanCalculator.loadHistoryItem(index);

    if (!item) {
      return;
    }

    this.result = item;
    this.clearExtraPaymentScenario();
  }

  removeHistoryItem(index: number): void {
    this.loanCalculator.removeHistoryItem(index);
    this.history = this.loanCalculator.getHistory();
  }

  clearHistory(): void {
    if (typeof confirm !== 'undefined' && !confirm('¿Eliminar todo el historial?')) {
      return;
    }

    this.loanCalculator.clearHistory();
    this.history = [];
  }

  clearAndGoBack(): void {
    this.loanCalculator.clearResult();
    void this.router.navigate(['/calculator']);
  }

  shareWhatsApp(): void {
    this.openShare(`https://wa.me/?text=${encodeURIComponent(this.shareText())}`);
  }

  shareFacebook(): void {
    this.openShare(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(location.href)}`,
    );
  }

  shareLinkedIn(): void {
    this.openShare(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(location.href)}`,
    );
  }

  async copySummary(): Promise<void> {
    if (typeof navigator === 'undefined') {
      return;
    }

    await navigator.clipboard.writeText(this.shareText());

    this.shareFeedback = 'Resumen copiado al portapapeles.';

    setTimeout(() => {
      this.shareFeedback = '';
    }, 2500);
  }

  formatInputDate(value: string): string {
    const [year, month, day] = value.split('-');

    return year && month && day ? `${day}/${month}/${year}` : value;
  }

  clientName(result: LoanResult): string {
    return `${result.request.firstName} ${result.request.lastName}`.trim() || 'Solicitante';
  }

  private async generateExtraPaymentPdf(
    loanResult: LoanResult,
    extraResult: ExtraPaymentResult,
  ): Promise<void> {
    const doc = new jsPDF('p', 'mm', 'a4');

    const reportNumber = `AB-${this.dateKey()}-${Date.now().toString().slice(-6)}`;

    doc.setTextColor('#0d47a1');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('LoanCalc RD', 14, 18);

    doc.setFontSize(13);
    doc.text('Simulación de abonos extraordinarios', 196, 18, { align: 'right' });

    doc.setDrawColor('#0d47a1');
    doc.line(14, 24, 196, 24);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#475569');
    doc.setFontSize(8);
    doc.text(`Reporte: ${reportNumber}`, 14, 29);
    doc.text(`Generado: ${new Date().toLocaleString('es-DO')}`, 196, 29, { align: 'right' });

    autoTable(doc, {
      startY: 34,
      head: [['Datos del préstamo', 'Valor', 'Configuración', 'Valor']],
      body: [
        ['Cliente', this.clientName(loanResult), 'Tipo', loanResult.request.loanType],
        [
          'Monto original',
          this.money(loanResult.request.amount),
          'Tasa anual',
          `${loanResult.request.annualRate.toFixed(2)}%`,
        ],
        [
          'Abono configurado',
          this.money(extraResult.request.amount),
          'Mes de inicio',
          extraResult.request.startMonth.toString(),
        ],
        [
          'Frecuencia',
          this.extraPaymentFrequencyLabel(extraResult.request.frequency),
          'Estrategia',
          this.extraPaymentStrategyLabel(extraResult.request.strategy),
        ],
      ],
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 2.5,
      },
      headStyles: {
        fillColor: '#0d6efd',
        textColor: '#ffffff',
      },
    });

    autoTable(doc, {
      startY: 72,
      head: [['Indicador', 'Escenario original', 'Nuevo escenario', 'Ahorro']],
      body: [
        [
          'Plazo',
          `${extraResult.originalTermMonths} meses`,
          `${extraResult.newTermMonths} meses`,
          `${extraResult.monthsSaved} meses`,
        ],
        [
          'Interés total',
          this.money(extraResult.originalTotalInterest),
          this.money(extraResult.newTotalInterest),
          this.money(extraResult.interestSaved),
        ],
        [
          'Total a pagar',
          this.money(extraResult.originalTotalPayment),
          this.money(extraResult.newTotalPayment),
          this.money(Math.max(extraResult.originalTotalPayment - extraResult.newTotalPayment, 0)),
        ],
        [
          'Cuota mensual',
          this.money(extraResult.originalResult.monthlyPayment),
          this.money(extraResult.finalMonthlyPayment),
          this.money(
            Math.max(
              extraResult.originalResult.monthlyPayment - extraResult.finalMonthlyPayment,
              0,
            ),
          ),
        ],
      ],
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 2.5,
      },
      headStyles: {
        fillColor: '#198754',
        textColor: '#ffffff',
      },
    });

    const summaryTable = (
      doc as jsPDF & {
        lastAutoTable?: {
          finalY: number;
        };
      }
    ).lastAutoTable;

    const amortizationStartY = (summaryTable?.finalY ?? 106) + 8;

    autoTable(doc, {
      startY: amortizationStartY,
      head: [['No.', 'Fecha', 'Cuota regular', 'Abono extra', 'Interés', 'Capital', 'Balance']],
      body: extraResult.amortization.map((row) => [
        row.number,
        row.paymentDate,
        this.money(row.regularPayment),
        row.extraPayment > 0 ? this.money(row.extraPayment) : '—',
        this.money(row.interest),
        this.money(row.principal),
        this.money(row.balance),
      ]),
      theme: 'striped',
      styles: {
        fontSize: 6.5,
        cellPadding: 1.8,
      },
      headStyles: {
        fillColor: '#0d47a1',
        textColor: '#ffffff',
      },
      didParseCell: (hookData) => {
        const rowIndex = hookData.row.index;

        if (
          hookData.section === 'body' &&
          rowIndex >= 0 &&
          extraResult.amortization[rowIndex]?.extraPayment > 0
        ) {
          hookData.cell.styles.fillColor = '#e8f5ee';
          hookData.cell.styles.textColor = '#146c43';
          hookData.cell.styles.fontStyle = 'bold';
        }
      },
      didDrawPage: (hookData) => {
        const pageNumber = doc.getCurrentPageInfo().pageNumber;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor('#64748b');

        doc.text(`LoanCalc RD · ${reportNumber}`, 14, 289);

        doc.text(`Página ${pageNumber}`, 196, 289, { align: 'right' });

        if (hookData.pageNumber > 1) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor('#0d47a1');
          doc.text('Tabla de amortización con abonos extraordinarios', 14, 12);
        }
      },
    });

    const qr = await QRCode.toDataURL('https://github.com/Jairo0811/CalculadoraPrestamos');

    const lastPage = doc.getNumberOfPages();

    doc.setPage(lastPage);
    doc.addImage(qr, 'PNG', 174, 260, 20, 20);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#64748b');
    doc.setFontSize(7);

    doc.text(
      'Este documento es una simulación financiera y no constituye una oferta de crédito.',
      14,
      275,
    );

    doc.text(
      `Total abonado extraordinariamente: ${this.money(extraResult.totalExtraPayments)}`,
      14,
      280,
    );

    doc.save(`LoanCalcRD-Abonos-${this.dateKey()}.pdf`);
  }

  private async generatePdf(result: LoanResult): Promise<void> {
    const doc = new jsPDF('p', 'mm', 'a4');

    doc.setTextColor('#0d47a1');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('LoanCalc RD', 14, 18);

    doc.setFontSize(14);
    doc.text('Resultado de simulación', 196, 18, {
      align: 'right',
    });

    doc.setDrawColor('#0d47a1');
    doc.line(14, 24, 196, 24);

    autoTable(doc, {
      startY: 30,
      body: [
        ['Cliente', this.clientName(result), 'Tipo', result.request.loanType],
        [
          'Monto',
          this.money(result.request.amount),
          'Tasa',
          `${result.request.annualRate.toFixed(2)}%`,
        ],
        [
          'Cuota mensual',
          this.money(result.monthlyPayment),
          'Total',
          this.money(result.totalPayment),
        ],
      ],
      theme: 'grid',
      styles: { fontSize: 9 },
    });

    autoTable(doc, {
      startY: 58,
      head: [['No.', 'Fecha', 'Cuota', 'Interés', 'Capital', 'Balance']],
      body: result.amortization.map((row) => [
        row.number,
        row.paymentDate,
        this.money(row.payment),
        this.money(row.interest),
        this.money(row.principal),
        this.money(row.balance),
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: '#0d47a1' },
    });

    const qr = await QRCode.toDataURL('https://github.com/Jairo0811/CalculadoraPrestamos');

    const lastPage = doc.getNumberOfPages();

    doc.setPage(lastPage);
    doc.addImage(qr, 'PNG', 174, 265, 20, 20);
    doc.save(`LoanCalcRD-${this.dateKey()}.pdf`);
  }

  private shareText(): string {
    if (!this.result) {
      return 'LoanCalc RD';
    }

    return [
      'LoanCalc RD — Simulación de préstamo',
      `Tipo: ${this.result.request.loanType}`,
      `Monto: ${this.money(this.result.request.amount)}`,
      `Cuota mensual: ${this.money(this.result.monthlyPayment)}`,
      `Interés total: ${this.money(this.result.totalInterest)}`,
      `Total a pagar: ${this.money(this.result.totalPayment)}`,
    ].join('\n');
  }

  private openShare(url: string): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer,width=760,height=620');
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = filename;
    anchor.click();

    URL.revokeObjectURL(url);
  }

  private escapeXml(value: string): string {
    const replacements: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;',
    };

    return value.replace(/[<>&'"]/g, (character) => replacements[character] ?? character);
  }

  private dateKey(): string {
    const date = new Date();

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('');
  }

  private extraPaymentFrequencyLabel(frequency: ExtraPaymentFrequency): string {
    return frequency === 'monthly' ? 'Abono mensual' : 'Abono único';
  }

  private extraPaymentStrategyLabel(strategy: ExtraPaymentStrategy): string {
    return strategy === 'reduce-payment' ? 'Reducir la cuota' : 'Reducir el plazo';
  }

  private money(value: number): string {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
    }).format(value);
  }
}
