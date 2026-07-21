/**
 * Validates Dominican identity-card numbers using the Luhn checksum.
 *
 * Adapted from the public OGTIC Cuenta Única Registry implementation:
 * https://github.com/ogticrd/cuenta-unica-registry
 * License: MIT.
 */
export function isValidDominicanId(value: string): boolean {
  const digits = value.replace(/\D/g, '');

  if (!/^\d{11}$/.test(digits)) {
    return false;
  }

  const reversedDigits = digits
    .split('')
    .reverse()
    .map(Number);

  const verificationDigit = reversedDigits.shift();

  if (verificationDigit === undefined) {
    return false;
  }

  const sum = reversedDigits.reduce((total, digit, index) => {
    if (index % 2 !== 0) {
      return total + digit;
    }

    const doubled = digit * 2;
    return total + (doubled > 9 ? doubled - 9 : doubled);
  }, verificationDigit);

  return sum % 10 === 0;
}
