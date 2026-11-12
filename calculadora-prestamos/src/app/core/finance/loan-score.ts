/**
 * LoanCalc Score: indicador matemático interno que clasifica una simulación
 * según la proporción de intereses sobre el capital (interés total ÷ monto × 100).
 * No es un puntaje de crédito ni predice la aprobación de ninguna entidad.
 *
 * Los umbrales son los publicados en la portada y en la guía; no deben cambiar
 * sin actualizar también esos textos.
 */
export type LoanScoreGrade = 'A+' | 'A' | 'B' | 'C' | 'D';
export type LoanScoreTone = 'good' | 'medium' | 'high';

export interface LoanScoreBand {
  readonly grade: LoanScoreGrade;
  /** Límite superior inclusivo del porcentaje de interés sobre capital. */
  readonly maxPercentage: number;
  readonly description: string;
  readonly tone: LoanScoreTone;
}

export const LOAN_SCORE_BANDS: readonly LoanScoreBand[] = [
  { grade: 'A+', maxPercentage: 15, description: 'Costo financiero excelente', tone: 'good' },
  { grade: 'A', maxPercentage: 25, description: 'Costo financiero favorable', tone: 'good' },
  { grade: 'B', maxPercentage: 40, description: 'Costo financiero moderado', tone: 'medium' },
  { grade: 'C', maxPercentage: 60, description: 'Costo financiero elevado', tone: 'high' },
  { grade: 'D', maxPercentage: Number.POSITIVE_INFINITY, description: 'Costo financiero muy elevado', tone: 'high' }
];

/** Banda correspondiente a un porcentaje de interés sobre capital. */
export function loanScoreBand(interestOverCapitalPercentage: number): LoanScoreBand {
  return (
    LOAN_SCORE_BANDS.find(band => interestOverCapitalPercentage <= band.maxPercentage) ??
    LOAN_SCORE_BANDS[LOAN_SCORE_BANDS.length - 1]
  );
}

/** Rango legible de una banda: "Hasta 15 %", "15–25 %", "Más de 60 %". */
export function loanScoreRangeLabel(band: LoanScoreBand): string {
  const index = LOAN_SCORE_BANDS.indexOf(band);
  const previous = index > 0 ? LOAN_SCORE_BANDS[index - 1].maxPercentage : null;
  // Espacio no separable: el símbolo % nunca queda solo en otra línea.
  if (!Number.isFinite(band.maxPercentage)) return `Más de ${previous}\u00A0%`;
  if (previous === null) return `Hasta ${band.maxPercentage}\u00A0%`;
  return `${previous}–${band.maxPercentage}\u00A0%`;
}
