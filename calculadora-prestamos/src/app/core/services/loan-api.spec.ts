import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LoanRequest } from '../models/loan.model';
import { LoanApiService, toCreatePayload } from './loan-api';

const request: LoanRequest = {
  firstName: 'Ana',
  lastName: 'Pérez',
  birthDate: '1990-01-01',
  documentId: '001-0000000-1',
  amount: 850000,
  annualRate: 14.5,
  termMonths: 60,
  loanType: 'Vehículo'
};

describe('LoanApiService', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends only financial data, never personal identifiers', () => {
    TestBed.inject(LoanApiService).saveSimulation(request).subscribe();
    const call = http.expectOne('http://localhost:5000/api/v1/simulations');
    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual({
      name: 'Vehículo · RD$ 850,000',
      loanType: 3,
      amount: 850000,
      annualRate: 14.5,
      termMonths: 60
    });
    const serialized = JSON.stringify(call.request.body);
    expect(serialized).not.toContain('001-0000000-1');
    expect(serialized).not.toContain('Ana');
    expect(serialized).not.toContain('userId');
    call.flush({});
  });

  it('maps every loan type and caps the generated name length', () => {
    expect(toCreatePayload({ ...request, loanType: 'Hipotecario' }).loanType).toBe(2);
    expect(toCreatePayload({ ...request, loanType: 'Comercial' }).loanType).toBe(5);
    expect(toCreatePayload({ ...request, loanType: 'Educativo' }).loanType).toBe(4);
    expect(toCreatePayload({ ...request, loanType: 'Personal' }).loanType).toBe(1);
    expect(toCreatePayload({ ...request, amount: 1e30 }).name.length).toBeLessThanOrEqual(120);
  });

  it('encodes identifiers in resource URLs', () => {
    const api = TestBed.inject(LoanApiService);
    api.delete('a/b').subscribe();
    http.expectOne('http://localhost:5000/api/v1/simulations/a%2Fb').flush(null);
  });
});
