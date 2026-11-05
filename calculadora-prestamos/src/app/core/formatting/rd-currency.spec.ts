import { RdCurrencyPipe, formatRd } from './rd-currency';

describe('formatRd', () => {
  it('formats Dominican pesos consistently with RD$ and two decimals', () => {
    expect(formatRd(1234567.891)).toBe('RD$ 1,234,567.89');
    expect(formatRd(0)).toBe('RD$ 0.00');
    expect(formatRd(18076.2)).toBe('RD$ 18,076.20');
  });

  it('supports custom decimals and negatives', () => {
    expect(formatRd(500000, 0)).toBe('RD$ 500,000');
    expect(formatRd(-250.5)).toBe('-RD$ 250.50');
  });

  it('never shows a negative zero from floating point residue', () => {
    expect(formatRd(-0.000001)).toBe('RD$ 0.00');
  });

  it('handles missing or invalid values without throwing', () => {
    expect(formatRd(null)).toBe('RD$ —');
    expect(formatRd(undefined)).toBe('RD$ —');
    expect(formatRd(Number.NaN)).toBe('RD$ —');
  });

  it('exposes the same format through the rd pipe with a non-breaking space', () => {
    expect(new RdCurrencyPipe().transform(1500.5)).toBe('RD$\u00A01,500.50');
  });
});
