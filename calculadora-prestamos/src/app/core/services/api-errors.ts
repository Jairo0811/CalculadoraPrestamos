import { HttpErrorResponse } from '@angular/common/http';

export type ApiErrorKind =
  | 'network'
  | 'rate-limited'
  | 'invalid-credentials'
  | 'email-not-confirmed'
  | 'invalid-link'
  | 'weak-password'
  | 'invalid-current-password'
  | 'same-password'
  | 'invalid-email'
  | 'email-unavailable'
  | 'session-expired'
  | 'forbidden'
  | 'not-found'
  | 'validation'
  | 'server'
  | 'unknown';

export interface ApiErrorInfo {
  kind: ApiErrorKind;
  /** Mensaje listo para mostrar al usuario. Nunca contiene detalles técnicos. */
  message: string;
  /** Detalles de validación ya traducidos por la API (por ejemplo, requisitos de contraseña). */
  details: string[];
  retryAfterSeconds: number | null;
}

const MESSAGES: Record<ApiErrorKind, string> = {
  network: 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo. La calculadora sigue disponible sin cuenta.',
  'rate-limited': 'Demasiados intentos seguidos. Espera un momento antes de volver a intentarlo.',
  'invalid-credentials': 'Correo o contraseña incorrectos. Tras varios intentos fallidos la cuenta se bloquea temporalmente por seguridad.',
  'email-not-confirmed': 'Tu cuenta aún no está confirmada. Revisa tu correo o solicita un nuevo enlace de confirmación.',
  'invalid-link': 'El enlace es inválido, ya fue utilizado o ha expirado. Solicita uno nuevo.',
  'weak-password': 'La contraseña no cumple los requisitos de seguridad.',
  'invalid-current-password': 'La contraseña actual no es correcta.',
  'same-password': 'La nueva contraseña debe ser distinta de la actual.',
  'invalid-email': 'Introduce un correo electrónico válido.',
  'email-unavailable': 'El servicio de correo no está disponible en este momento. Inténtalo más tarde.',
  'session-expired': 'Tu sesión expiró o fue cerrada. Inicia sesión nuevamente.',
  forbidden: 'No se pudo verificar la solicitud. Recarga la página e inténtalo de nuevo.',
  'not-found': 'El recurso solicitado no existe o no pertenece a tu cuenta.',
  validation: 'Revisa los datos introducidos.',
  server: 'Ocurrió un problema en el servidor. Inténtalo de nuevo en unos minutos.',
  unknown: 'No se pudo completar la operación. Inténtalo de nuevo.'
};

const CODE_TO_KIND: Record<string, ApiErrorKind> = {
  invalid_credentials: 'invalid-credentials',
  email_not_confirmed: 'email-not-confirmed',
  invalid_link: 'invalid-link',
  weak_password: 'weak-password',
  invalid_current_password: 'invalid-current-password',
  same_password: 'same-password',
  invalid_email: 'invalid-email',
  email_unavailable: 'email-unavailable',
  session_expired: 'session-expired',
  csrf_rejected: 'forbidden',
  too_many_requests: 'rate-limited',
  not_found: 'not-found',
  validation_failed: 'validation',
  malformed_request: 'validation'
};

/**
 * Traduce cualquier error HTTP a un mensaje comprensible, basado en el código estable
 * (`code`) que devuelve la API en Problem Details. Los textos internos nunca se muestran tal cual,
 * salvo los detalles de validación que la API ya entrega traducidos y seguros.
 */
export function describeApiError(error: unknown): ApiErrorInfo {
  if (!(error instanceof HttpErrorResponse)) {
    return build('unknown');
  }

  if (error.status === 0) return build('network');

  const body = isRecord(error.error) ? error.error : null;
  const code = typeof body?.['code'] === 'string' ? body['code'] : null;
  const details = extractDetails(body);
  const retryAfter = Number(error.headers?.get('Retry-After'));
  const retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null;

  const kind: ApiErrorKind =
    (code && CODE_TO_KIND[code]) ||
    (error.status === 401 ? 'session-expired'
      : error.status === 403 ? 'forbidden'
      : error.status === 404 ? 'not-found'
      : error.status === 429 ? 'rate-limited'
      : error.status === 503 ? 'email-unavailable'
      : error.status === 400 ? 'validation'
      : error.status >= 500 ? 'server'
      : 'unknown');

  const info = build(kind, kind === 'weak-password' || kind === 'validation' ? details : []);
  info.retryAfterSeconds = retryAfterSeconds;
  if (kind === 'rate-limited' && retryAfterSeconds) {
    info.message = `Demasiados intentos seguidos. Vuelve a intentarlo en ${retryAfterSeconds} segundos.`;
  }
  return info;
}

function build(kind: ApiErrorKind, details: string[] = []): ApiErrorInfo {
  return { kind, message: MESSAGES[kind], details, retryAfterSeconds: null };
}

function extractDetails(body: Record<string, unknown> | null): string[] {
  const errors = body?.['errors'];
  if (!isRecord(errors)) return [];
  const messages = Object.values(errors)
    .flatMap(value => (Array.isArray(value) ? value : []))
    .filter((value): value is string => typeof value === 'string' && value.length < 200);
  return [...new Set(messages)].slice(0, 6);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
