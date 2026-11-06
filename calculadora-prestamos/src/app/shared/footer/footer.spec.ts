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

  it('ofrece enlaces internos a privacidad, términos y contacto', () => {
    const links = [...fixture.nativeElement.querySelectorAll('.footer-legal a')] as HTMLAnchorElement[];
    expect(links.map(a => a.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/privacy', '/terms', '/contact'])
    );
    expect(links.some(a => a.href.startsWith('mailto:'))).toBe(false);
  });
});
