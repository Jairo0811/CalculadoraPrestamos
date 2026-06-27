import { TestBed } from '@angular/core/testing';

import { LoanCalculator } from './loan-calculator';

describe('LoanCalculator', () => {
  let service: LoanCalculator;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LoanCalculator);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
