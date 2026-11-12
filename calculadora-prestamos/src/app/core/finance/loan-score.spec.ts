import { LOAN_SCORE_BANDS, loanScoreBand, loanScoreRangeLabel } from './loan-score';

describe('loanScoreBand', () => {
  it('conserva los umbrales publicados (15 / 25 / 40 / 60 %) con límites inclusivos', () => {
    const cases: Array<[number, string]> = [
      [0, 'A+'], [15, 'A+'], [15.0001, 'A'],
      [25, 'A'], [25.01, 'B'],
      [40, 'B'], [40.01, 'C'],
      [60, 'C'], [60.01, 'D'], [250, 'D']
    ];
    for (const [percentage, grade] of cases) {
      expect(loanScoreBand(percentage).grade, `${percentage} %`).toBe(grade);
    }
  });

  it('clasifica como D un valor no numérico, igual que la versión anterior', () => {
    expect(loanScoreBand(Number.NaN).grade).toBe('D');
  });

  it('mantiene descripciones y tonos', () => {
    expect(LOAN_SCORE_BANDS.map(b => `${b.grade}:${b.tone}`)).toEqual(['A+:good', 'A:good', 'B:medium', 'C:high', 'D:high']);
    expect(loanScoreBand(30).description).toBe('Costo financiero moderado');
  });
});

describe('loanScoreRangeLabel', () => {
  it('describe cada tramo de la escala', () => {
    const labels = LOAN_SCORE_BANDS.map(band => loanScoreRangeLabel(band).replace(/\u00A0/g, ' '));
    expect(labels).toEqual(['Hasta 15 %', '15–25 %', '25–40 %', '40–60 %', 'Más de 60 %']);
  });
});
