import { AppConfig } from '../app/core/config/app-config';

/**
 * Configuración de desarrollo local.
 * La API ASP.NET Core se ejecuta en http://localhost:5000 (ver backend/README.md).
 */
export const environment: AppConfig = {
  production: false,
  apiBaseUrl: 'http://localhost:5000/api/v1',
  features: {
    accounts: true
  }
};
