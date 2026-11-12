import type { ExtraPaymentFrequency } from '../../core/models/loan.model';

/**
 * Utilidades de presentación de la pantalla de resultados.
 * No calculan intereses ni amortización: solo ordenan y escalan datos
 * que ya produjo LoanCalculatorService.
 */

export type ResultsSectionId = 'resumen' | 'analisis' | 'abonos' | 'comparador' | 'amortizacion';

export interface ResultsSection {
  readonly id: ResultsSectionId;
  readonly label: string;
}

export const RESULTS_SECTIONS: readonly ResultsSection[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'analisis', label: 'Análisis financiero' },
  { id: 'abonos', label: 'Abonos extraordinarios' },
  { id: 'comparador', label: 'Comparador' },
  { id: 'amortizacion', label: 'Amortización' }
];

/**
 * Meses en los que se PLANEA aplicar un abono según el plazo original.
 * Replica la regla de LoanCalculatorService.getExtraPaymentForMonth para
 * anticipar el calendario; si el préstamo se liquida antes, el motor deja
 * de aplicar los abonos restantes.
 */
export function plannedExtraPaymentMonths(
  startMonth: number,
  frequency: ExtraPaymentFrequency,
  termMonths: number
): number[] {
  if (!Number.isInteger(startMonth) || !Number.isInteger(termMonths) || startMonth < 1 || startMonth > termMonths) {
    return [];
  }
  if (frequency === 'single') return [startMonth];

  const step = frequency === 'annual' ? 12 : 1;
  const months: number[] = [];
  for (let month = startMonth; month <= termMonths; month += step) months.push(month);
  return months;
}

/**
 * Puntos SVG (viewBox 0–100) del balance pendiente.
 * El primer punto es el monto prestado en el mes 0; el eje X usa `scaleMonths`
 * para que un escenario más corto termine antes en el mismo gráfico.
 */
export function balancePolylinePoints(startBalance: number, balances: readonly number[], scaleMonths: number): string {
  if (startBalance <= 0 || scaleMonths <= 0 || balances.length === 0) return '';

  const round = (value: number) => Math.round(value * 100) / 100;
  const y = (balance: number) => round(100 - (Math.max(balance, 0) / startBalance) * 100);
  const points = [`0,${y(startBalance)}`];
  balances.forEach((balance, index) => points.push(`${round(((index + 1) / scaleMonths) * 100)},${y(balance)}`));
  return points.join(' ');
}

/** Posición horizontal (en %) del centro de un mes dentro de una barra de plazo. */
export function monthPosition(month: number, termMonths: number): number {
  if (termMonths <= 0) return 0;
  return Math.min(Math.max(((month - 0.5) / termMonths) * 100, 0), 100);
}
