import { evaluatePassword, isValidEmail, meetsPasswordPolicy } from './password-policy';

describe('password policy', () => {
  it('mirrors the API Identity policy', () => {
    expect(meetsPasswordPolicy('Seguro!2026PassWord')).toBe(true);
    expect(meetsPasswordPolicy('corta1!A')).toBe(false);
    expect(meetsPasswordPolicy('sinmayusculas2026!')).toBe(false);
    expect(meetsPasswordPolicy('SINMINUSCULAS2026!')).toBe(false);
    expect(meetsPasswordPolicy('SinNumerosNiNada!')).toBe(false);
    expect(meetsPasswordPolicy('SinSimbolos2026Aa')).toBe(false);
    expect(meetsPasswordPolicy('A1!' + 'a'.repeat(130))).toBe(false);
  });

  it('reports each rule individually for the live checklist', () => {
    const checks = evaluatePassword('abc');
    expect(checks.find(c => c.rule.id === 'lower')?.met).toBe(true);
    expect(checks.find(c => c.rule.id === 'length')?.met).toBe(false);
    expect(checks).toHaveLength(5);
  });
});

describe('isValidEmail', () => {
  it('accepts normal addresses and rejects malformed input', () => {
    expect(isValidEmail('persona@example.com')).toBe(true);
    expect(isValidEmail('  persona@example.com.do ')).toBe(true);
    expect(isValidEmail('sin-arroba')).toBe(false);
    expect(isValidEmail('Nombre <persona@example.com>')).toBe(false);
    expect(isValidEmail('persona@dominio')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});
