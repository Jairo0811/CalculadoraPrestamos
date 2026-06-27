import { Component, inject } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { LoanCalculatorService } from '../../core/services/loan-calculator';
import { LoanResult } from '../../core/models/loan.model';

@Component({
  selector: 'app-results',
  imports: [CurrencyPipe, DecimalPipe, RouterLink],
  templateUrl: './results.html',
  styleUrl: './results.css',
})
export class Results {
  private readonly router = inject(Router);
  private readonly loanCalculator = inject(LoanCalculatorService);

  result: LoanResult | null = this.loanCalculator.getResult();

  constructor() {
    if (!this.result) {
      this.router.navigate(['/calculator']);
    }
  }

  print(): void {
    if (!this.result) return;
    this.generatePdf(this.result);
  }

  clearAndGoBack(): void {
    this.loanCalculator.clearResult();
    this.router.navigate(['/calculator']);
  }

  private generatePdf(result: LoanResult): void {
    const doc = new jsPDF('p', 'mm', 'a4');
    const logo = new Image();

    logo.src = '/assets/img/logo-loancalc-rd.png';

    logo.onload = async () => {
      this.drawPdfHeader(doc, logo);
      this.drawReportInfo(doc, result);
      this.drawSummary(doc, result);
      this.drawClientAndLoanInfo(doc, result);
      this.drawAmortizationTable(doc, result);
      await this.drawQrCodeOnLastPage(doc);
      this.drawFooterOnAllPages(doc);

      doc.save(`LoanCalcRD-${this.formatDateKey(new Date())}.pdf`);
    };

    logo.onerror = async () => {
      this.drawPdfHeader(doc);
      this.drawReportInfo(doc, result);
      this.drawSummary(doc, result);
      this.drawClientAndLoanInfo(doc, result);
      this.drawAmortizationTable(doc, result);
      await this.drawQrCodeOnLastPage(doc);
      this.drawFooterOnAllPages(doc);

      doc.save(`LoanCalcRD-${this.formatDateKey(new Date())}.pdf`);
    };
  }

  private drawPdfHeader(doc: jsPDF, logo?: HTMLImageElement): void {
    const pageWidth = doc.internal.pageSize.getWidth();
    const primary = '#0d47a1';

    if (logo) {
      doc.addImage(logo, 'PNG', 14, 12, 55, 24);
    } else {
      doc.setTextColor(primary);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('LOANCALC RD', 14, 22);
    }

    doc.setTextColor(primary);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('RESULTADO DE SIMULACIÓN', pageWidth - 14, 20, { align: 'right' });

    doc.setTextColor('#475569');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Resumen del préstamo y calendario de amortización', pageWidth - 14, 27, {
      align: 'right',
    });

    doc.setDrawColor(primary);
    doc.setLineWidth(0.5);
    doc.line(14, 42, pageWidth - 14, 42);
  }

  private drawReportInfo(doc: jsPDF, result: LoanResult): void {
    const reportNumber = `LC-${this.formatDateKey(new Date())}-${this.generateCode()}`;
    const clientName = `${result.request.firstName} ${result.request.lastName}`.trim();

    doc.setDrawColor('#cbd5e1');
    doc.setFillColor('#f8fafc');
    doc.roundedRect(14, 47, 182, 24, 2, 2, 'FD');

    doc.setTextColor('#0d47a1');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('LoanCalc RD', 18, 55);

    doc.setTextColor('#64748b');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Simulador Profesional de Préstamos', 18, 61);

    doc.setTextColor('#64748b');
    doc.setFontSize(7);
    doc.text('Reporte No.', 82, 54);
    doc.text('Fecha', 82, 63);
    doc.text('Cliente', 130, 54);
    doc.text('Tipo', 130, 63);

    doc.setTextColor('#0f172a');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(reportNumber, 102, 54, { maxWidth: 38 });
    doc.text(new Date().toLocaleDateString('es-DO'), 102, 63);
    doc.text(clientName || 'No especificado', 145, 54, { maxWidth: 47 });
    doc.text(result.request.loanType || 'No especificado', 145, 63, { maxWidth: 47 });
  }

  private drawSummary(doc: jsPDF, result: LoanResult): void {
    const items = [
      ['Monto solicitado', this.money(result.request.amount)],
      ['Cuota mensual', this.money(result.monthlyPayment)],
      ['Interés total', this.money(result.totalInterest)],
      ['Total a pagar', this.money(result.totalPayment)],
    ];

    let x = 14;
    const y = 78;
    const cardWidth = 43;
    const cardHeight = 22;

    items.forEach(([label, value], index) => {
      doc.setDrawColor('#cbd5e1');
      doc.setFillColor(index === 1 ? '#eff6ff' : '#ffffff');
      doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'FD');

      doc.setTextColor('#64748b');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text(label.toUpperCase(), x + 4, y + 8);

      doc.setTextColor(index === 1 ? '#0d47a1' : '#0f172a');
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(value, x + 4, y + 16);

      x += cardWidth + 5;
    });
  }

  private drawClientAndLoanInfo(doc: jsPDF, result: LoanResult): void {
    autoTable(doc, {
      startY: 110,
      theme: 'plain',
      styles: {
        fontSize: 8.5,
        cellPadding: 2,
        overflow: 'linebreak',
      },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: '#64748b', cellWidth: 38 },
        1: { halign: 'right', textColor: '#0f172a', cellWidth: 50 },
      },
      head: [['DATOS DEL SOLICITANTE', '']],
      headStyles: {
        textColor: '#0d47a1',
        fontStyle: 'bold',
        fontSize: 10,
      },
      body: [
        ['Nombre', `${result.request.firstName} ${result.request.lastName}`.trim()],
        ['Cédula', result.request.documentId],
        ['Edad', result.age ? `${result.age}` : 'No especificada'],
        [
          'Fecha nacimiento',
          result.request.birthDate
            ? this.formatInputDate(result.request.birthDate)
            : 'No especificada',
        ],
      ],
      margin: { left: 14, right: 108 },
      tableWidth: 88,
    });

    autoTable(doc, {
      startY: 110,
      theme: 'plain',
      styles: {
        fontSize: 8.5,
        cellPadding: 2,
        overflow: 'linebreak',
      },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: '#64748b', cellWidth: 38 },
        1: { halign: 'right', textColor: '#0f172a', cellWidth: 50 },
      },
      head: [['CONDICIONES DEL PRÉSTAMO', '']],
      headStyles: {
        textColor: '#0d47a1',
        fontStyle: 'bold',
        fontSize: 10,
      },
      body: [
        ['Tipo', result.request.loanType],
        ['Tasa anual', `${result.request.annualRate.toFixed(2)}%`],
        ['Duración', `${result.request.termMonths} meses`],
        ['Cantidad cuotas', `${result.amortization.length}`],
      ],
      margin: { left: 108, right: 14 },
      tableWidth: 88,
    });
  }

  private formatInputDate(value: string): string {
    const [year, month, day] = value.split('-');

    if (!year || !month || !day) {
      return value;
    }

    return `${day}/${month}/${year}`;
  }

  private drawAmortizationTable(doc: jsPDF, result: LoanResult): void {
    autoTable(doc, {
      startY: 170,
      head: [['No.', 'Fecha de pago', 'Cuota', 'Interés', 'Capital', 'Saldo pendiente']],
      body: result.amortization.map((row) => [
        row.number,
        row.paymentDate,
        this.money(row.payment),
        this.money(row.interest),
        this.money(row.principal),
        this.money(row.balance),
      ]),
      styles: {
        fontSize: 7,
        cellPadding: 1.6,
        lineColor: '#e2e8f0',
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: '#0d47a1',
        textColor: '#ffffff',
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: '#f8fafc',
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 25 },
        2: { cellWidth: 34, halign: 'right' },
        3: { cellWidth: 34, halign: 'right' },
        4: { cellWidth: 34, halign: 'right' },
        5: { cellWidth: 34, halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    });
  }

  private async drawQrCodeOnLastPage(doc: jsPDF): Promise<void> {
    const pageCount = doc.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const qrData = await QRCode.toDataURL('https://github.com/Jairo0811/CalculadoraPrestamos', {
      margin: 1,
      width: 120,
    });

    doc.setPage(pageCount);
    doc.addImage(qrData, 'PNG', pageWidth - 34, pageHeight - 43, 20, 20);

    doc.setTextColor('#64748b');
    doc.setFontSize(5.5);
    doc.text('Escanee para visitar\nel proyecto en GitHub', pageWidth - 24, pageHeight - 21, {
      align: 'center',
    });
  }

  private drawFooterOnAllPages(doc: jsPDF): void {
    const pageCount = doc.getNumberOfPages();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();

    for (let page = 1; page <= pageCount; page++) {
      doc.setPage(page);

      doc.setDrawColor('#0d47a1');
      doc.setLineWidth(0.3);
      doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);

      doc.setTextColor('#64748b');
      doc.setFontSize(8);
      doc.text('LoanCalc RD · Simulador Financiero RD', 14, pageHeight - 9);

      doc.text(`Página ${page} de ${pageCount}`, pageWidth / 2, pageHeight - 9, {
        align: 'center',
      });

      doc.text(`Fecha: ${new Date().toLocaleString('es-DO')}`, pageWidth - 14, pageHeight - 9, {
        align: 'right',
      });
    }
  }

  private formatDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}${month}${day}`;
  }

  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ1234567890';
    let code = '';

    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return code;
  }

  private money(value: number): string {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2,
    }).format(value);
  }
}
