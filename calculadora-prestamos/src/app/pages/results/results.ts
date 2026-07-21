import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { LoanResult } from '../../core/models/loan.model';
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
  imports: [CurrencyPipe, DecimalPipe, RouterLink, FormsModule],
  templateUrl: './results.html',
  styleUrl: './results.css'
})
export class Results {
  private readonly router = inject(Router);
  private readonly loanCalculator = inject(LoanCalculatorService);

  result: LoanResult | null = this.loanCalculator.getResult();
  history: LoanResult[] = this.loanCalculator.getHistory();
  shareFeedback = '';

  bankRates = [
    { name: 'Banco Popular', annualRate: 18.5 },
    { name: 'Banreservas', annualRate: 17.75 },
    { name: 'Banco BHD', annualRate: 19.25 },
    { name: 'APAP', annualRate: 18.0 }
  ];

  constructor() {
    if (!this.result) {
      this.router.navigate(['/calculator']);
    }
  }

  get comparisons(): ComparisonOption[] {
    if (!this.result) return [];

    return this.bankRates
      .map(bank => {
        const simulated = this.loanCalculator.calculate({
          ...this.result!.request,
          annualRate: Number(bank.annualRate)
        });

        return {
          name: bank.name,
          annualRate: Number(bank.annualRate),
          monthlyPayment: simulated.monthlyPayment,
          totalInterest: simulated.totalInterest,
          totalPayment: simulated.totalPayment
        };
      })
      .sort((a, b) => a.totalPayment - b.totalPayment);
  }

  get chartPoints(): string {
    if (!this.result?.amortization.length) return '';
    const rows = this.result.amortization;
    const max = Math.max(...rows.map(row => row.balance), 1);
    return rows
      .map((row, index) => {
        const x = (index / Math.max(rows.length - 1, 1)) * 100;
        const y = 100 - (row.balance / max) * 100;
        return `${x},${y}`;
      })
      .join(' ');
  }

  get principalPercentage(): number {
    if (!this.result?.totalPayment) return 0;
    return (this.result.request.amount / this.result.totalPayment) * 100;
  }

  get interestPercentage(): number {
    return 100 - this.principalPercentage;
  }

  print(): void {
    if (this.result) void this.generatePdf(this.result);
  }

  exportExcel(): void {
    if (!this.result || typeof document === 'undefined') return;

    const result = this.result;
    const rows = result.amortization
      .map(row => `
        <Row>
          <Cell><Data ss:Type="Number">${row.number}</Data></Cell>
          <Cell><Data ss:Type="String">${this.escapeXml(row.paymentDate)}</Data></Cell>
          <Cell><Data ss:Type="Number">${row.payment}</Data></Cell>
          <Cell><Data ss:Type="Number">${row.interest}</Data></Cell>
          <Cell><Data ss:Type="Number">${row.principal}</Data></Cell>
          <Cell><Data ss:Type="Number">${row.balance}</Data></Cell>
        </Row>`)
      .join('');

    const workbook = `<?xml version="1.0"?>
      <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
        xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
        <Worksheet ss:Name="Resumen"><Table>
          <Row><Cell><Data ss:Type="String">LoanCalc RD</Data></Cell></Row>
          <Row><Cell><Data ss:Type="String">Cliente</Data></Cell><Cell><Data ss:Type="String">${this.escapeXml(this.clientName(result))}</Data></Cell></Row>
          <Row><Cell><Data ss:Type="String">Tipo</Data></Cell><Cell><Data ss:Type="String">${this.escapeXml(result.request.loanType)}</Data></Cell></Row>
          <Row><Cell><Data ss:Type="String">Monto</Data></Cell><Cell><Data ss:Type="Number">${result.request.amount}</Data></Cell></Row>
          <Row><Cell><Data ss:Type="String">Cuota mensual</Data></Cell><Cell><Data ss:Type="Number">${result.monthlyPayment}</Data></Cell></Row>
          <Row><Cell><Data ss:Type="String">Interés total</Data></Cell><Cell><Data ss:Type="Number">${result.totalInterest}</Data></Cell></Row>
          <Row><Cell><Data ss:Type="String">Total a pagar</Data></Cell><Cell><Data ss:Type="Number">${result.totalPayment}</Data></Cell></Row>
        </Table></Worksheet>
        <Worksheet ss:Name="Amortización"><Table>
          <Row><Cell><Data ss:Type="String">No.</Data></Cell><Cell><Data ss:Type="String">Fecha</Data></Cell><Cell><Data ss:Type="String">Cuota</Data></Cell><Cell><Data ss:Type="String">Interés</Data></Cell><Cell><Data ss:Type="String">Capital</Data></Cell><Cell><Data ss:Type="String">Balance</Data></Cell></Row>
          ${rows}
        </Table></Worksheet>
      </Workbook>`;

    this.downloadBlob(
      new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8' }),
      `LoanCalcRD-${this.dateKey()}.xls`
    );
  }

  loadSimulation(index: number): void {
    const item = this.loanCalculator.loadHistoryItem(index);
    if (item) this.result = item;
  }

  removeHistoryItem(index: number): void {
    this.loanCalculator.removeHistoryItem(index);
    this.history = this.loanCalculator.getHistory();
  }

  clearHistory(): void {
    if (typeof confirm !== 'undefined' && !confirm('¿Eliminar todo el historial?')) return;
    this.loanCalculator.clearHistory();
    this.history = [];
  }

  clearAndGoBack(): void {
    this.loanCalculator.clearResult();
    this.router.navigate(['/calculator']);
  }

  shareWhatsApp(): void {
    this.openShare(`https://wa.me/?text=${encodeURIComponent(this.shareText())}`);
  }

  shareFacebook(): void {
    this.openShare(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(location.href)}`);
  }

  shareLinkedIn(): void {
    this.openShare(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(location.href)}`);
  }

  async copySummary(): Promise<void> {
    if (typeof navigator === 'undefined') return;
    await navigator.clipboard.writeText(this.shareText());
    this.shareFeedback = 'Resumen copiado al portapapeles.';
    setTimeout(() => (this.shareFeedback = ''), 2500);
  }

  formatInputDate(value: string): string {
    const [year, month, day] = value.split('-');
    return year && month && day ? `${day}/${month}/${year}` : value;
  }

  clientName(result: LoanResult): string {
    return `${result.request.firstName} ${result.request.lastName}`.trim() || 'Solicitante';
  }

  private async generatePdf(result: LoanResult): Promise<void> {
    const doc = new jsPDF('p', 'mm', 'a4');
    doc.setTextColor('#0d47a1');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('LoanCalc RD', 14, 18);
    doc.setFontSize(14);
    doc.text('Resultado de simulación', 196, 18, { align: 'right' });
    doc.setDrawColor('#0d47a1');
    doc.line(14, 24, 196, 24);

    autoTable(doc, {
      startY: 30,
      body: [
        ['Cliente', this.clientName(result), 'Tipo', result.request.loanType],
        ['Monto', this.money(result.request.amount), 'Tasa', `${result.request.annualRate.toFixed(2)}%`],
        ['Cuota mensual', this.money(result.monthlyPayment), 'Total', this.money(result.totalPayment)]
      ],
      theme: 'grid',
      styles: { fontSize: 9 }
    });

    autoTable(doc, {
      startY: 58,
      head: [['No.', 'Fecha', 'Cuota', 'Interés', 'Capital', 'Balance']],
      body: result.amortization.map(row => [
        row.number,
        row.paymentDate,
        this.money(row.payment),
        this.money(row.interest),
        this.money(row.principal),
        this.money(row.balance)
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: '#0d47a1' }
    });

    const qr = await QRCode.toDataURL('https://github.com/Jairo0811/CalculadoraPrestamos');
    const lastPage = doc.getNumberOfPages();
    doc.setPage(lastPage);
    doc.addImage(qr, 'PNG', 174, 265, 20, 20);
    doc.save(`LoanCalcRD-${this.dateKey()}.pdf`);
  }

  private shareText(): string {
    if (!this.result) return 'LoanCalc RD';
    return [
      'LoanCalc RD — Simulación de préstamo',
      `Tipo: ${this.result.request.loanType}`,
      `Monto: ${this.money(this.result.request.amount)}`,
      `Cuota mensual: ${this.money(this.result.monthlyPayment)}`,
      `Interés total: ${this.money(this.result.totalInterest)}`,
      `Total a pagar: ${this.money(this.result.totalPayment)}`
    ].join('\n');
  }

  private openShare(url: string): void {
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer,width=760,height=620');
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
    return value.replace(/[<>&'\"]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char] ?? char);
  }

  private dateKey(): string {
    const date = new Date();
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  }

  private money(value: number): string {
    return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(value);
  }
}
