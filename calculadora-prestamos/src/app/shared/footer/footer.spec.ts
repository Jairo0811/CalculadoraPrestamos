import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Footer } from './footer';

describe('Footer', () => {
  let component: Footer;
  let fixture: ComponentFixture<Footer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Footer],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Footer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('muestra el logo oficial en el pie de página', () => {
    const logo = fixture.nativeElement.querySelector('.footer-logo') as HTMLImageElement;
    expect(logo).toBeTruthy();
    expect(logo.getAttribute('src')).toBe('/assets/img/logo-loancalc-rd-900.webp');
    expect(logo.getAttribute('alt')).toBe('LoanCalc RD');
  });

  it('ofrece enlaces internos a privacidad, términos y contacto', () => {
    const links = [...fixture.nativeElement.querySelectorAll('.footer-legal a')] as HTMLAnchorElement[];
    expect(links.map(a => a.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/privacy', '/terms', '/contact'])
    );
    expect(links.some(a => a.href.startsWith('mailto:'))).toBe(false);
  });
});
