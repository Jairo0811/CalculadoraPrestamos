export interface PasswordRule {
  id: 'length' | 'upper' | 'lower' | 'digit' | 'symbol';
  label: string;
  test: (password: string) => boolean;
}

/** Reglas idénticas a la política de ASP.NET Core Identity configurada en la API. */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: 'length', label: 'Al menos 12 caracteres', test: p => p.length >= 12 && p.length <= 128 },
  { id: 'upper', label: 'Una letra mayúscula', test: p => /[A-Z]/.test(p) },
  { id: 'lower', label: 'Una letra minúscula', test: p => /[a-z]/.test(p) },
  { id: 'digit', label: 'Un número', test: p => /\d/.test(p) },
  { id: 'symbol', label: 'Un símbolo (! # $ % …)', test: p => /[^A-Za-z0-9]/.test(p) }
];

export function evaluatePassword(password: string): { rule: PasswordRule; met: boolean }[] {
  return PASSWORD_RULES.map(rule => ({ rule, met: rule.test(password ?? '') }));
}

export function meetsPasswordPolicy(password: string): boolean {
  return PASSWORD_RULES.every(rule => rule.test(password ?? ''));
}

const EMAIL_PATTERN = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

export function isValidEmail(email: string): boolean {
  const value = (email ?? '').trim();
  return value.length > 0 && value.length <= 254 && EMAIL_PATTERN.test(value);
}
