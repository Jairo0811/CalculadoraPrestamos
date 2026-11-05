import { AppConfig } from '../app/core/config/app-config';

/**
 * Configuración de producción (Netlify).
 *
 * - `apiBaseUrl` es relativo: la API se publicará detrás de un proxy de mismo origen
 *   (regla `/api/*` en netlify.toml), lo que permite cookies `SameSite=Strict`.
 * - Las cuentas permanecen desactivadas para usuarios finales hasta que la API y el
 *   proveedor SMTP estén desplegados (Fase 8). La calculadora pública no depende de ellas.
 */
export const environment: AppConfig = {
  production: true,
  apiBaseUrl: '/api/v1',
  features: {
    accounts: false
  }
};
