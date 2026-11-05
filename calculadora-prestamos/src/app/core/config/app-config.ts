import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface AppConfig {
  production: boolean;
  /** URL base de la API versionada, sin barra final (absoluta o relativa al sitio). */
  apiBaseUrl: string;
  features: {
    /** Habilita registro, inicio de sesión y área privada. */
    accounts: boolean;
  };
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG', {
  providedIn: 'root',
  factory: () => ({ ...environment, apiBaseUrl: environment.apiBaseUrl.replace(/\/+$/, '') })
});
