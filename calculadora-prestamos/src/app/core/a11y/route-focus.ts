import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, Injector, afterNextRender, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/** Ruta sin consulta ni fragmento: "/results?x=1#a" → "/results". */
export function routePath(url: string): string {
  return url.split(/[?#]/, 1)[0] || '/';
}

/**
 * Decide si una navegación debe llevar al usuario al inicio de la nueva página.
 * - La primera navegación (carga inicial) respeta el foco del navegador.
 * - Las navegaciones a un fragmento (#seccion) las gestiona el desplazamiento por anclas.
 * - Cambiar solo la consulta en la misma ruta no mueve el foco.
 */
export function shouldMoveFocus(previousUrl: string | null, nextUrl: string): boolean {
  if (previousUrl === null) return false;
  if (nextUrl.includes('#')) return false;
  return routePath(previousUrl) !== routePath(nextUrl);
}

/**
 * Lleva la vista al inicio y mueve el foco al título principal de la página,
 * para que teclado y lectores de pantalla empiecen en el nuevo contenido.
 * Devuelve el elemento enfocado (o null si no hay página).
 */
export function focusPageStart(doc: Document): HTMLElement | null {
  const view = doc.defaultView;
  view?.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });

  const main = doc.getElementById('main-content');
  const target = (main?.querySelector<HTMLElement>('h1') ?? main) || null;
  if (!target) return null;

  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
  return target;
}

/** Gestión accesible del foco y del desplazamiento al cambiar de ruta. */
@Injectable({ providedIn: 'root' })
export class RouteFocus {
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private previousUrl: string | null = null;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(event => {
        const moveFocus = shouldMoveFocus(this.previousUrl, event.urlAfterRedirects);
        this.previousUrl = event.urlAfterRedirects;
        if (!moveFocus) return;
        // Espera a que la nueva página esté pintada antes de buscar su título.
        afterNextRender(() => focusPageStart(this.doc), { injector: this.injector });
      });
  }
}
