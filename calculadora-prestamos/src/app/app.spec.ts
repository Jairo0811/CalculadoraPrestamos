import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
  });

  it('renders the shell with skip link, navigation and footer', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.skip-link')?.textContent).toContain('Saltar al contenido');
    expect(element.querySelector('nav[aria-label="Navegación principal"]')).not.toBeNull();
    expect(element.querySelector('app-footer')).not.toBeNull();
  });

  it('tries to restore the session in the browser without blocking the page', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const http = TestBed.inject(HttpTestingController);
    const refresh = http.expectOne(request => request.url.endsWith('/auth/refresh'));
    refresh.error(new ProgressEvent('error'), { status: 0 });
    expect(fixture.nativeElement.textContent).toContain('Iniciar sesión');
  });
});
