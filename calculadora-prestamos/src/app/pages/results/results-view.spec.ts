import { RESULTS_SECTIONS, balancePolylinePoints, monthPosition, plannedExtraPaymentMonths } from './results-view';

describe('plannedExtraPaymentMonths', () => {
  it('abono único: solo el mes indicado', () => {
    expect(plannedExtraPaymentMonths(12, 'single', 36)).toEqual([12]);
  });

  it('abono anual: cada 12 meses desde el mes indicado', () => {
    expect(plannedExtraPaymentMonths(12, 'annual', 36)).toEqual([12, 24, 36]);
    expect(plannedExtraPaymentMonths(7, 'annual', 36)).toEqual([7, 19, 31]);
  });

  it('abono mensual: todos los meses desde el indicado', () => {
    expect(plannedExtraPaymentMonths(34, 'monthly', 36)).toEqual([34, 35, 36]);
  });

  it('sin plan cuando el mes no está dentro del plazo', () => {
    expect(plannedExtraPaymentMonths(0, 'annual', 36)).toEqual([]);
    expect(plannedExtraPaymentMonths(37, 'single', 36)).toEqual([]);
    expect(plannedExtraPaymentMonths(1.5, 'monthly', 36)).toEqual([]);
  });
});

describe('balancePolylinePoints', () => {
  it('empieza en el monto prestado y baja hasta cero', () => {
    expect(balancePolylinePoints(1000, [500, 0], 2)).toBe('0,0 50,50 100,100');
  });

  it('un escenario más corto termina antes en el eje X', () => {
    expect(balancePolylinePoints(1000, [0], 4)).toBe('0,0 25,100');
  });

  it('no dibuja nada sin datos válidos', () => {
    expect(balancePolylinePoints(0, [0], 12)).toBe('');
    expect(balancePolylinePoints(1000, [], 12)).toBe('');
  });
});

describe('monthPosition', () => {
  it('centra cada mes dentro de la barra del plazo', () => {
    expect(monthPosition(1, 10)).toBe(5);
    expect(monthPosition(10, 10)).toBe(95);
  });
});

describe('RESULTS_SECTIONS', () => {
  it('ordena la navegación interna de resultados', () => {
    expect(RESULTS_SECTIONS.map(s => s.label)).toEqual([
      'Resumen', 'Análisis financiero', 'Abonos extraordinarios', 'Comparador', 'Amortización'
    ]);
  });
});
