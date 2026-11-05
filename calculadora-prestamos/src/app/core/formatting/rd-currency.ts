import { Pipe, PipeTransform } from '@angular/core';

const formatters = new Map<number, Intl.NumberFormat>();

function formatter(decimals: number): Intl.NumberFormat {
  let instance = formatters.get(decimals);
  if (!instance) {
    instance = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
    formatters.set(decimals, instance);
  }
  return instance;
}

/**
 * Formato monetario único de LoanCalc RD: `RD$ 1,234,567.89`.
 * Independiente del locale del navegador para que pantalla, PDF y Excel coincidan.
 */
export function formatRd(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'RD$ —';
  }
  // Evita mostrar "-RD$ 0.00" por residuos de coma flotante.
  const rounded = Math.abs(value) < 0.5 * 10 ** -decimals ? 0 : value;
  const sign = rounded < 0 ? '-' : '';
  return `${sign}RD$ ${formatter(decimals).format(Math.abs(rounded))}`;
}

/**
 * Pipe `rd` para plantillas. Usa espacio no separable para que "RD$" nunca quede
 * en una línea distinta de la cifra en tarjetas estrechas.
 */
@Pipe({ name: 'rd' })
export class RdCurrencyPipe implements PipeTransform {
  transform(value: number | null | undefined, decimals = 2): string {
    return formatRd(value, decimals).replace('RD$ ', 'RD$\u00A0');
  }
}
