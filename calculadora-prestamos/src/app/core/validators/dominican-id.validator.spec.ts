import { describe, expect, it } from 'vitest';
import { isValidDominicanId } from './dominican-id.validator';

describe('isValidDominicanId', () => {
  it('acepta una cédula válida sin guiones', () => {
    expect(isValidDominicanId('00113918205')).toBe(true);
  });

  it('acepta una cédula válida con formato dominicano', () => {
    expect(isValidDominicanId('001-1391820-5')).toBe(true);
  });

  it('rechaza una cédula con checksum inválido', () => {
    expect(isValidDominicanId('00113918204')).toBe(false);
  });

  it('rechaza valores con una cantidad distinta de 11 dígitos', () => {
    expect(isValidDominicanId('0011391820')).toBe(false);
    expect(isValidDominicanId('001139182055')).toBe(false);
  });

  it('rechaza valores vacíos o no numéricos', () => {
    expect(isValidDominicanId('')).toBe(false);
    expect(isValidDominicanId('ABCDEFGHIJK')).toBe(false);
  });
});
