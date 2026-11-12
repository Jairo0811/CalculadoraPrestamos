import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { APP_CONFIG } from '../../core/config/app-config';
import { LoanRequest } from '../../core/models/loan.model';
import { LoanCalculatorService } from '../../core/services/loan-calculator';
import { Results } from './results';

const REQUEST: LoanRequest = {
  firstName: '',
  lastName: '',
  birthDate: '',
  documentId: '',
  amount: 500000,
  annualRate: 18,
  termMonths: 36,
  loanType: 'Personal'
};

describe('Results', () => {
  let fixture: ComponentFixture<Results>;
  let component: Results;
  let element: HTMLElement;

  function setup(request: LoanRequest = REQUEST): void {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [Results],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { production: false, apiBaseUrl: '/api/v1', features: { accounts: false } } }
      ]
    });
    const service = TestBed.inject(LoanCalculatorService);
    service.saveResult(service.calculate(request));
    fixture = TestBed.createComponent(Results);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
  }

  /** Rellena y envía el formulario de abonos como lo haría una persona. */
  async function submitExtraPayment(amount: string, startMonth: string, frequency: RegExp, strategy?: RegExp): Promise<void> {
    await fixture.whenStable();
    const setValue = (selector: string, value: string) => {
      const input = element.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    const choose = (pattern: RegExp) => {
      const label = [...element.querySelectorAll<HTMLLabelElement>('label.choice')].find(l => pattern.test(l.textContent ?? ''));
      label!.querySelector('input')!.click();
    };
    setValue('#extra-amount', amount);
    setValue('#extra-start', startMonth);
    choose(frequency);
    if (strategy) choose(strategy);
    element.querySelector<HTMLButtonElement>('.extra-payment-form button[type="submit"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const text = (selector: string) => element.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('presenta la cuota mensual estimada como cifra protagonista', () => {
    setup();
    expect(text('.payment-label')).toBe('Cuota mensual estimada');
    expect(text('.payment-value')).toBe('RD$ 18,076.20'.replace(/\s+/g, ' '));
  });

  it('resume monto, tasa, plazo, intereses y total sin repetir métricas', () => {
    setup();
    const terms = [...element.querySelectorAll('.summary-facts dt')].map(dt => dt.textContent?.trim());
    expect(terms).toEqual(['Monto solicitado', 'Tasa anual', 'Plazo', 'Intereses totales', 'Total a pagar']);

    // El interés total no se repite como KPI en el análisis.
    const kpis = [...element.querySelectorAll('.kpi dt')].map(dt => dt.textContent?.trim());
    expect(kpis).toEqual(['Interés sobre capital', 'Interés promedio mensual', 'Interés promedio anual']);
  });

  it('mantiene la jerarquía de acciones sin colores destructivos para "Nueva simulación"', () => {
    setup();
    const buttons = [...element.querySelectorAll<HTMLButtonElement>('.actions-bar button')];
    const byName = (name: string) => buttons.find(b => b.textContent?.trim() === name);
    expect(byName('PDF')?.classList).toContain('btn-primary');
    expect(byName('Excel')?.classList).toContain('btn-outline-primary');
    expect(byName('Nueva simulación')?.classList).toContain('btn-outline-secondary');
    expect(element.querySelector('.actions-bar .btn-danger')).toBeNull();
  });

  it('explica que el LoanCalc Score no es un puntaje de crédito y marca su tramo', () => {
    setup();
    // 150,743.12 / 500,000 = 30.1 % → B (umbral 25–40 %).
    expect(component.loanScore).toBe('B');
    expect(component.loanScoreClass).toBe('score-medium');
    expect(text('.score-note')).toContain('No es un puntaje de crédito');
    expect(text('.score-scale [aria-current="true"] strong')).toBe('B');
  });

  it('ofrece navegación interna accesible hacia las cinco secciones', () => {
    setup();
    const nav = element.querySelector('nav[aria-label="Secciones de resultados"]');
    const links = [...(nav?.querySelectorAll('a') ?? [])];
    expect(links.map(a => a.textContent?.trim())).toEqual([
      'Resumen', 'Análisis financiero', 'Abonos extraordinarios', 'Comparador', 'Amortización'
    ]);
    for (const link of links) {
      const id = link.getAttribute('href')!.split('#')[1];
      expect(element.querySelector(`#${id}`), id).not.toBeNull();
    }
    expect(links[0].getAttribute('aria-current')).toBe('location');
  });

  it('lleva el foco al título de la sección elegida', () => {
    setup();
    const section = element.querySelector<HTMLElement>('#abonos')!;
    section.scrollIntoView = vi.fn();
    const event = new MouseEvent('click', { cancelable: true });

    component.goToSection(event, 'abonos');
    fixture.detectChanges();

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('extra-payment-title');
    expect(component.activeSection()).toBe('abonos');
  });

  it('anticipa el calendario de abonos anuales antes de calcular', () => {
    setup();
    component.extraPaymentStartMonth = 12;
    component.extraPaymentFrequency = 'annual';
    expect(component.plannedExtraPaymentMonths).toEqual([12, 24, 36]);
    component.extraPaymentFrequency = 'single';
    expect(component.plannedExtraPaymentMonths).toEqual([12]);
  });

  it('muestra los meses reales de los abonos anuales y la comparación original frente a con abonos', async () => {
    setup();
    await submitExtraPayment('2000', '12', /Abono anual/);

    expect(component.annualExtraPaymentMonths).toEqual([12, 24]);
    expect(text('.extra-payment-applied-note')).toContain('12, 24');
    const highlighted = [...element.querySelectorAll('.extra-payment-row td:first-child')].map(td => td.textContent?.trim());
    expect(highlighted).toEqual(['12', '24']);
    expect(text('#compare-title')).toBe('Préstamo original frente a préstamo con abonos');
    expect(text('.compare-note')).toContain('no está garantizado');
  });

  it('utiliza un lenguaje financiero claro en los resultados y las advertencias', () => {
    setup();
    expect(text('#balance-title')).toBe('Evolución del saldo pendiente');
    expect(text('.chart-card[aria-labelledby="balance-title"] .chart-help')).toContain('una mayor parte de cada cuota se destina a intereses');
    expect(text('.advice-disclaimer')).toContain('no constituyen asesoría financiera personalizada');
    expect(text('.extra-payment-card .section-head p')).toContain('un escenario que incluye abonos');
  });

  it('describe los abonos mensuales aplicados y la cuota recalculada al reducir la cuota', async () => {
    setup();
    await submitExtraPayment('1000', '30', /Abono mensual/, /Reducir la cuota/);

    expect(component.appliedExtraPaymentMonths[0]).toBe(30);
    expect(text('.extra-payment-applied-note')).toContain('del mes 30');
    expect(text('.savings-grid')).toContain('Cuota recalculada');
    // La cuota del escenario se calcula en el servicio; la vista solo la muestra.
    expect(component.extraPaymentResult!.finalMonthlyPayment).toBeLessThan(component.result!.monthlyPayment);
  });

  it('conserva todas las filas del cronograma y añade totales', () => {
    setup();
    const rows = element.querySelectorAll('#amortizacion tbody tr');
    expect(rows.length).toBe(36);
    expect(text('#amortizacion tfoot')).toContain('Totales');
  });

  it('solo muestra los datos del solicitante cuando se proporcionaron', () => {
    setup();
    expect(element.querySelector('.applicant-card')).toBeNull();

    TestBed.resetTestingModule();
    setup({ ...REQUEST, firstName: 'Ana', lastName: 'Pérez' });
    expect(text('.applicant-card')).toContain('Ana Pérez');
  });
});
