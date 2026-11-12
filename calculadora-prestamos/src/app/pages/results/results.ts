import { DOCUMENT, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, Injector, afterNextRender, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { jsPDF } from 'jspdf';

import {
  ExtraPaymentFrequency,
  ExtraPaymentResult,
  ExtraPaymentStrategy,
  LoanResult,
} from '../../core/models/loan.model';
import { LoanCalculatorService } from '../../core/services/loan-calculator';
import { RdCurrencyPipe, formatRd } from '../../core/formatting/rd-currency';
import { AuthService } from '../../core/services/auth';
import { LoanApiService } from '../../core/services/loan-api';
import { focusPageStart } from '../../core/a11y/route-focus';
import {
  LOAN_SCORE_BANDS,
  LoanScoreBand,
  loanScoreBand,
  loanScoreRangeLabel,
} from '../../core/finance/loan-score';
import {
  RESULTS_SECTIONS,
  ResultsSectionId,
  balancePolylinePoints,
  monthPosition,
  plannedExtraPaymentMonths,
} from './results-view';

interface ComparisonOption {
  name: string;
  annualRate: number;
  monthlyPayment: number;
  totalInterest: number;
  totalPayment: number;
}

@Component({
  selector: 'app-results',
  imports: [RdCurrencyPipe, DecimalPipe, RouterLink, FormsModule],
  templateUrl: './results.html',
  styleUrl: './results.css',
})
export class Results {
  private readonly router = inject(Router);
  private readonly loanCalculator = inject(LoanCalculatorService);
  private readonly api = inject(LoanApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  readonly auth = inject(AuthService);

  /** Navegación interna accesible entre las secciones de resultados. */
  readonly sections = RESULTS_SECTIONS;
  readonly activeSection = signal<ResultsSectionId>('resumen');
  readonly scoreBands = LOAN_SCORE_BANDS;
  readonly scoreRangeLabel = loanScoreRangeLabel;
  readonly monthPosition = monthPosition;

  // Signals: la respuesta asíncrona de HttpClient actualiza Angular sin depender de Zone.js.
  readonly cloudSaving = signal(false);
  readonly cloudSavedId = signal<string | null>(null);
  readonly cloudSaveError = signal('');
  readonly cloudSaveNotice = signal('');


  result: LoanResult | null = this.loanCalculator.getResult();
  history: LoanResult[] = this.loanCalculator.getHistory();

  /** Señal: el mensaje llega tras una promesa y debe pintarse sin Zone.js. */
  readonly shareFeedback = signal('');

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

    afterNextRender(() => this.observeSections());
  }

  /** Lleva a una sección y mueve el foco a su título sin cambiar la URL. */
  goToSection(event: Event, id: ResultsSectionId): void {
    event.preventDefault();
    const section = this.document.getElementById(id);
    if (!section) return;

    const reduceMotion = this.document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;
    section.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });

    const heading = section.querySelector<HTMLElement>('h1, h2') ?? section;
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
    this.activeSection.set(id);
  }

  /** Marca como actual la sección visible bajo la cabecera fija. */
  private observeSections(): void {
    const view = this.document.defaultView;
    if (!view || typeof view.IntersectionObserver === 'undefined') return;

    const visible = new Set<ResultsSectionId>();
    const observer = new view.IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const id = entry.target.id as ResultsSectionId;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        const current = this.sections.find(section => visible.has(section.id));
        if (current) this.activeSection.set(current.id);
      },
      { rootMargin: '-140px 0px -55% 0px' },
    );

    for (const section of this.sections) {
      const element = this.document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    this.destroyRef.onDestroy(() => observer.disconnect());
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

  /** Balance pendiente del préstamo original (SVG 0–100). */
  get balancePoints(): string {
    if (!this.result) return '';
    return balancePolylinePoints(
      this.result.request.amount,
      this.result.amortization.map((row) => row.balance),
      this.result.request.termMonths,
    );
  }

  /** Balance pendiente con abonos, en la misma escala que el original. */
  get extraBalancePoints(): string {
    if (!this.result || !this.extraPaymentResult) return '';
    return balancePolylinePoints(
      this.result.request.amount,
      this.extraPaymentResult.amortization.map((row) => row.balance),
      this.result.request.termMonths,
    );
  }

  get balanceChartLabel(): string {
    if (!this.result) return '';
    const base = `Gráfico del balance pendiente: empieza en ${this.money(this.result.request.amount)} y llega a cero en el mes ${this.result.request.termMonths}`;
    return this.extraPaymentResult
      ? `${base}. Con abonos llega a cero en el mes ${this.extraPaymentResult.newTermMonths}.`
      : `${base}.`;
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

  get loanScoreBand(): LoanScoreBand {
    return loanScoreBand(this.interestOverCapitalPercentage);
  }

  get loanScore(): string {
    return this.loanScoreBand.grade;
  }

  get loanScoreDescription(): string {
    return this.loanScoreBand.description;
  }

  get loanScoreClass(): string {
    return `score-${this.loanScoreBand.tone}`;
  }

  get hasApplicantData(): boolean {
    const request = this.result?.request;
    return !!request && !!(request.firstName || request.lastName || request.documentId || request.birthDate);
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
            : this.extraPaymentResult.request.frequency === 'annual'
              ? 'Inicio de los abonos anuales (cada 12 meses)'
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

  get annualExtraPaymentMonths(): number[] {
    const scenario = this.extraPaymentResult;
    if (!scenario || scenario.request.frequency !== 'annual') {
      return [];
    }
    return scenario.amortization
      .filter((row) => row.extraPayment > 0)
      .map((row) => row.number);
  }

  /** Cuotas en las que el escenario calculado aplicó un abono (cualquier frecuencia). */
  get appliedExtraPaymentMonths(): number[] {
    return this.extraPaymentResult?.amortization
      .filter((row) => row.extraPayment > 0)
      .map((row) => row.number) ?? [];
  }

  /** Calendario previsto según el formulario, antes de calcular. */
  get plannedExtraPaymentMonths(): number[] {
    if (!this.result) return [];
    return plannedExtraPaymentMonths(
      Number(this.extraPaymentStartMonth),
      this.extraPaymentFrequency,
      this.result.request.termMonths,
    );
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

  /** Carga bajo demanda: el resultado sigue siendo gratuito aunque la API falle. */
  saveToCloud(): void {
    if (!this.auth.enabled || !this.auth.isAuthenticated() || !this.result ||
        this.cloudSaving() || this.cloudSavedId()) return;

    this.cloudSaving.set(true);
    this.cloudSaveError.set('');
    this.cloudSaveNotice.set('');
    this.api.saveSimulation(this.result.request).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: saved => {
        this.cloudSavedId.set(saved.id);
        this.cloudSaving.set(false);
        this.cloudSaveNotice.set('Guardada en tu cuenta. Puedes abrirla desde Mis simulaciones.');
      },
      error: () => {
        this.cloudSaving.set(false);
        this.cloudSaveError.set('No se pudo guardar en la nube. Tus resultados locales siguen disponibles.');
      }
    });
  }

  loadSimulation(index: number): void {
    const item = this.loanCalculator.loadHistoryItem(index);

    if (!item) {
      return;
    }

    this.result = item;
    this.cloudSavedId.set(null);
    this.cloudSaveNotice.set('');
    this.cloudSaveError.set('');
    this.clearExtraPaymentScenario();
    this.activeSection.set('resumen');
    // La simulación cargada reemplaza el resumen: se lleva al usuario a su inicio.
    afterNextRender(() => focusPageStart(this.document), { injector: this.injector });
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

    this.shareFeedback.set('Resumen copiado al portapapeles.');

    setTimeout(() => {
      this.shareFeedback.set('');
    }, 2500);
  }

  formatInputDate(value: string): string {
    const [year, month, day] = value.split('-');

    return year && month && day ? `${day}/${month}/${year}` : value;
  }

  clientName(result: LoanResult): string {
    return `${result.request.firstName} ${result.request.lastName}`.trim() || 'Solicitante';
  }


  /** El logo oficial se solicita solo al exportar; no incrementa el bundle inicial. */
  private async pdfOfficialLogo(): Promise<string | null> {
    let objectUrl: string | null = null;
    try {
      const response = await fetch('/assets/img/logo-loancalc-rd-480.webp');
      if (!response.ok) return null;
      objectUrl = URL.createObjectURL(await response.blob());
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Logo no disponible'));
        image.src = objectUrl!;
      });
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(image, 0, 0);
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  /** Cabecera corporativa y pie de página sobre cada hoja, sin invadir las tablas. */
  private decoratePdfPages(
    doc: jsPDF,
    logo: string | null,
    title: string,
    qr: string,
  ): void {
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      doc.setPage(page);
      doc.setFillColor('#071b3d');
      doc.rect(0, 0, 210, 28, 'F');
      if (logo) {
        doc.addImage(logo, 'PNG', 14, 3, 67, 22);
      } else {
        doc.setTextColor('#ffffff');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(17);
        doc.text('LoanCalc RD', 14, 17);
      }
      doc.setTextColor('#ffffff');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(title, 196, 13, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor('#c9ddf3');
      doc.text('Simulador profesional de préstamos', 196, 20, { align: 'right' });
      doc.setDrawColor('#dce6f2');
      doc.line(14, 284, 196, 284);
      doc.setTextColor('#64748b');
      doc.setFontSize(7);
      doc.text('Documento informativo. No constituye oferta ni aprobación de crédito.', 14, 290);
      doc.setTextColor('#1761b9');
      doc.text(`Página ${page} de ${pages}`, 196, 290, { align: 'right' });
      doc.addImage(qr, 'PNG', 183, 266, 11, 11);
    }
  }

  /** Normaliza fechas dd/m/aaaa del cronograma exclusivamente para el PDF. */
  private pdfPaymentDate(value: string): string {
    const match = /^(\\d{1,2})\/(\\d{1,2})\/(\\d{4})$/.exec(value);
    return match
      ? `${match[1].padStart(2, '0')}/${match[2].padStart(2, '0')}/${match[3]}`
      : value;
  }

  private async generateExtraPaymentPdf(
    loanResult: LoanResult,
    extraResult: ExtraPaymentResult,
  ): Promise<void> {
    // Los módulos PDF no se descargan hasta solicitar una exportación.
    const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
      this.pdfOfficialLogo(),
    ]);
    const doc = new jsPDF('p', 'mm', 'a4');

    const reportNumber = `AB-${this.dateKey()}-${Date.now().toString().slice(-6)}`;

    doc.setTextColor('#071b3d');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Comparación de abonos extraordinarios', 14, 40);
    doc.setTextColor('#596c84');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.text(
      `Total abonado: ${this.money(extraResult.totalExtraPayments)}`,
      196, 40, { align: 'right' },
    );

    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#475569');
    doc.setFontSize(8);
    doc.text(`Reporte: ${reportNumber}`, 14, 29);
    doc.text(`Generado: ${new Date().toLocaleString('es-DO')}`, 196, 29, { align: 'right' });

    autoTable(doc, {
      startY: 49,
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
        fillColor: '#0b2f68',
        textColor: '#ffffff',
      },
    });

    autoTable(doc, {
      startY: (
        (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 80
      ) + 7,
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
        fillColor: '#0d9488',
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

    const amortizationStartY = (summaryTable?.finalY ?? 122) + 8;

    autoTable(doc, {
      startY: amortizationStartY,
      head: [['No.', 'Fecha', 'Cuota regular', 'Abono extra', 'Interés', 'Capital', 'Balance']],
      body: extraResult.amortization.map((row) => [
        row.number,
        this.pdfPaymentDate(row.paymentDate),
        this.money(row.regularPayment),
        row.extraPayment > 0 ? this.money(row.extraPayment) : '—',
        this.money(row.interest),
        this.money(row.principal),
        this.money(row.balance),
      ]),
      theme: 'striped',
      showHead: 'everyPage',
      margin: { top: 36, bottom: 36, left: 14, right: 14 },
      styles: {
        fontSize: 6.5,
        cellPadding: 1.8,
      },
      headStyles: {
        fillColor: '#0b2f68',
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
    });

    const qr = await this.pdfQrDataUrl();

    this.decoratePdfPages(doc, logo, 'Abonos extraordinarios', qr);

    doc.save(`LoanCalcRD-Abonos-${this.dateKey()}.pdf`);
  }

  private async generatePdf(result: LoanResult): Promise<void> {
    const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
      this.pdfOfficialLogo(),
    ]);
    const doc = new jsPDF('p', 'mm', 'a4');

    doc.setTextColor('#596c84');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('SOLICITANTE', 14, 39);
    doc.text('MODALIDAD', 153, 39);
    doc.setTextColor('#172b49');
    doc.setFontSize(10);
    doc.text(this.clientName(result), 14, 46, { maxWidth: 127 });
    doc.text(result.request.loanType, 153, 46, { maxWidth: 43 });

    const metrics = [
      { title: 'CUOTA MENSUAL', value: this.money(result.monthlyPayment), dark: true },
      { title: 'CAPITAL INICIAL', value: this.money(result.request.amount), dark: false },
      { title: 'TOTAL ESTIMADO', value: this.money(result.totalPayment), dark: false },
    ];
    for (const [index, metric] of metrics.entries()) {
      const x = 14 + index * 62;
      doc.setFillColor(metric.dark ? '#0b2f68' : '#f2f6fc');
      doc.roundedRect(x, 52, 58, 22, 2.5, 2.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(metric.dark ? '#d5e6f7' : '#596c84');
      doc.text(metric.title, x + 3, 59);
      doc.setTextColor(metric.dark ? '#ffffff' : '#172b49');
      let size = metric.dark ? 12 : 10.5;
      doc.setFontSize(size);
      while (doc.getTextWidth(metric.value) > 52 && size > 7.5) {
        size -= 0.5;
        doc.setFontSize(size);
      }
      doc.text(metric.value, x + 3, 68);
    }

    doc.setTextColor('#596c84');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Tasa nominal anual: ${result.request.annualRate.toFixed(2)}%`, 14, 81);
    doc.text(`Plazo: ${result.amortization.length} cuotas`, 196, 81, { align: 'right' });
    doc.setFontSize(7.3);
    doc.text('Capital e intereses estimados según la simulación; pueden existir diferencias por redondeo.', 14, 87);

    autoTable(doc, {
      startY: 94,
      head: [['N.º', 'Fecha', 'Cuota', 'Interés', 'Capital', 'Saldo pendiente']],
      body: result.amortization.map((row) => [
        row.number,
        this.pdfPaymentDate(row.paymentDate),
        this.money(row.payment),
        this.money(row.interest),
        this.money(row.principal),
        this.money(row.balance),
      ]),
      theme: 'striped',
      showHead: 'everyPage',
      margin: { top: 36, bottom: 36, left: 14, right: 14 },
      styles: { fontSize: 7, cellPadding: 2.2, textColor: '#172b49' },
      headStyles: { fillColor: '#0b2f68', textColor: '#ffffff', fontStyle: 'bold' },
      alternateRowStyles: { fillColor: '#f5f8fc' },
      columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 25 } },
    });
    const qr = await this.pdfQrDataUrl();
    this.decoratePdfPages(doc, logo, 'Informe de simulación', qr);
    doc.save(`LoanCalcRD-${this.dateKey()}.pdf`);
  }

  /**
   * QR del informe como PNG para jsPDF, con un margen blanco de cuatro módulos.
   * uqr es ESM y se descarga exclusivamente cuando se exporta un PDF.
   */
  private async pdfQrDataUrl(): Promise<string> {
    const { encode } = await import('uqr');
    const { data, size } = encode('https://github.com/Jairo0811/CalculadoraPrestamos', { ecc: 'M' });
    const modulePixels = 6;
    const quietZone = 4;
    const dimension = (size + quietZone * 2) * modulePixels;
    const canvas = document.createElement('canvas');
    canvas.width = dimension;
    canvas.height = dimension;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('No se pudo generar el código QR del reporte.');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, dimension, dimension);
    context.fillStyle = '#000000';
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (data[y]?.[x]) {
          context.fillRect((x + quietZone) * modulePixels, (y + quietZone) * modulePixels, modulePixels, modulePixels);
        }
      }
    }

    return canvas.toDataURL('image/png');
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
    switch (frequency) {
      case 'monthly':
        return 'Abono mensual';
      case 'annual':
        return 'Abono anual (cada 12 meses)';
      default:
        return 'Abono único';
    }
  }

  private extraPaymentStrategyLabel(strategy: ExtraPaymentStrategy): string {
    return strategy === 'reduce-payment' ? 'Reducir la cuota' : 'Reducir el plazo';
  }

  private money(value: number): string {
    return formatRd(value);
  }
}
