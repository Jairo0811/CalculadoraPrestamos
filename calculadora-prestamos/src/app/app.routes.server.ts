import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Las pantallas de cuenta dependen de la sesión del navegador: nunca se prerenderizan.
  { path: 'account/**', renderMode: RenderMode.Client },
  { path: 'account', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Prerender }
];
