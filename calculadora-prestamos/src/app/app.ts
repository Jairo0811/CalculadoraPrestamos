import { Component, afterNextRender, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RouteFocus } from './core/a11y/route-focus';
import { AuthService } from './core/services/auth';
import { Footer } from './shared/footer/footer';
import { Header } from './shared/header/header';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  constructor() {
    const auth = inject(AuthService);
    // Al cambiar de página: arriba de inmediato y foco en el título (WCAG 2.4.3).
    inject(RouteFocus).start();
    // Recupera la sesión (cookie HttpOnly) sin bloquear el render ni afectar a la calculadora pública.
    afterNextRender(() => {
      if (auth.enabled) auth.restoreSession().subscribe();
    });
  }

  /** El enlace "#main-content" con <base href="/"> navegaría a la portada; se enfoca el contenido directamente. */
  skipToMain(event: Event): void {
    const main = document.getElementById('main-content');
    if (!main) return;
    event.preventDefault();
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    main.focus();
    main.scrollIntoView();
  }
}
