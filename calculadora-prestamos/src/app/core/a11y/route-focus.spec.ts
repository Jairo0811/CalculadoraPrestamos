import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { RouteFocus, focusPageStart, routePath, shouldMoveFocus } from './route-focus';

describe('routePath', () => {
  it('quita la consulta y el fragmento', () => {
    expect(routePath('/results?x=1#analisis')).toBe('/results');
    expect(routePath('/guide#cuota')).toBe('/guide');
    expect(routePath('')).toBe('/');
  });
});

describe('shouldMoveFocus', () => {
  it('no mueve el foco en la carga inicial', () => {
    expect(shouldMoveFocus(null, '/calculator')).toBe(false);
  });

  it('mueve el foco al cambiar de página', () => {
    expect(shouldMoveFocus('/calculator', '/results')).toBe(true);
    expect(shouldMoveFocus('/', '/guide')).toBe(true);
  });

  it('deja los fragmentos y los cambios de consulta al navegador', () => {
    expect(shouldMoveFocus('/', '/#features')).toBe(false);
    expect(shouldMoveFocus('/results', '/results?tab=2')).toBe(false);
  });
});

describe('focusPageStart', () => {
  beforeEach(() => vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined));
  afterEach(() => {
    document.getElementById('main-content')?.remove();
    vi.restoreAllMocks();
  });

  it('vuelve al inicio de la página de forma instantánea', () => {
    focusPageStart(document);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  });

  it('enfoca el h1 de la página sin volverlo tabulable', () => {
    const main = document.createElement('main');
    main.id = 'main-content';
    main.innerHTML = '<h1>Resumen del préstamo</h1>';
    document.body.appendChild(main);

    const focused = focusPageStart(document);

    expect(focused?.tagName).toBe('H1');
    expect(document.activeElement).toBe(focused);
    expect(focused?.getAttribute('tabindex')).toBe('-1');
  });

  it('usa el contenido principal si la página no tiene h1', () => {
    const main = document.createElement('main');
    main.id = 'main-content';
    document.body.appendChild(main);

    expect(focusPageStart(document)).toBe(main);
  });

  it('no falla si no hay contenido principal', () => {
    expect(focusPageStart(document)).toBeNull();
  });
});

@Component({ selector: 'lc-home-stub', template: '<main id="main-content"><h1>Inicio</h1></main>' })
class HomeStub {}

@Component({ selector: 'lc-results-stub', template: '<main id="main-content"><h1>Resultados</h1></main>' })
class ResultsStub {}

describe('RouteFocus', () => {
  beforeEach(() => vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('enfoca el título de la nueva página tras navegar', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '', component: HomeStub }, { path: 'results', component: ResultsStub }])]
    });
    const harness = await RouterTestingHarness.create();
    TestBed.inject(RouteFocus).start();

    await harness.navigateByUrl('/');
    await harness.navigateByUrl('/results');
    harness.detectChanges();
    await new Promise(resolve => setTimeout(resolve));

    expect(document.activeElement?.tagName).toBe('H1');
    expect(document.activeElement?.textContent).toBe('Resultados');
  });
});
