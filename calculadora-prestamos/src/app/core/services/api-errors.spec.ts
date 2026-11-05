import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { describeApiError } from './api-errors';

const problem = (status: number, body: unknown, headers?: HttpHeaders) =>
  new HttpErrorResponse({ status, error: body, headers, url: 'http://localhost:5000/api/v1/auth/login' });

describe('describeApiError', () => {
  it('maps network failures without technical details', () => {
    const info = describeApiError(new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') }));
    expect(info.kind).toBe('network');
    expect(info.message).toContain('calculadora sigue disponible');
  });

  it('uses the stable API code before the HTTP status', () => {
    expect(describeApiError(problem(403, { code: 'email_not_confirmed' })).kind).toBe('email-not-confirmed');
    expect(describeApiError(problem(401, { code: 'invalid_credentials' })).kind).toBe('invalid-credentials');
    expect(describeApiError(problem(400, { code: 'invalid_link' })).kind).toBe('invalid-link');
    expect(describeApiError(problem(403, { code: 'csrf_rejected' })).kind).toBe('forbidden');
  });

  it('falls back to status codes when no code is present', () => {
    expect(describeApiError(problem(401, null)).kind).toBe('session-expired');
    expect(describeApiError(problem(404, null)).kind).toBe('not-found');
    expect(describeApiError(problem(503, null)).kind).toBe('email-unavailable');
    expect(describeApiError(problem(500, 'Npgsql.PostgresException: stack')).kind).toBe('server');
  });

  it('includes translated validation details for weak passwords', () => {
    const info = describeApiError(problem(400, {
      code: 'weak_password',
      errors: { password: ['Debe incluir al menos un número.', 'Debe incluir al menos un símbolo.'] }
    }));
    expect(info.kind).toBe('weak-password');
    expect(info.details).toEqual(['Debe incluir al menos un número.', 'Debe incluir al menos un símbolo.']);
  });

  it('reports Retry-After when rate limited', () => {
    const info = describeApiError(problem(429, { code: 'too_many_requests' }, new HttpHeaders({ 'Retry-After': '42' })));
    expect(info.kind).toBe('rate-limited');
    expect(info.retryAfterSeconds).toBe(42);
    expect(info.message).toContain('42 segundos');
  });

  it('never echoes raw server messages', () => {
    const info = describeApiError(problem(500, { detail: 'System.InvalidOperationException at Program.cs:42' }));
    expect(info.message).not.toContain('Exception');
  });
});
