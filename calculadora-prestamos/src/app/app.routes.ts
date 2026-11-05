import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { Calculator } from './pages/calculator/calculator';
import { accountsEnabledGuard, authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', component: Home, title: 'LoanCalc RD · Simulador financiero dominicano' },
  { path: 'calculator', component: Calculator, title: 'Calculadora de préstamos · LoanCalc RD' },
  {
    // Carga diferida: jsPDF, AutoTable y QRCode solo se descargan al ver resultados.
    path: 'results',
    loadComponent: () => import('./pages/results/results').then(m => m.Results),
    title: 'Resultados de la simulación · LoanCalc RD'
  },
  {
    // Las cuentas solo existen en entornos donde la API y el correo están disponibles (ver environments/).
    path: 'account',
    canMatch: [accountsEnabledGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/account/account').then(m => m.Account),
        title: 'Tu cuenta · LoanCalc RD'
      },
      {
        path: 'simulations',
        canActivate: [authGuard],
        loadComponent: () => import('./pages/simulations/simulations').then(m => m.Simulations),
        title: 'Mis simulaciones guardadas · LoanCalc RD'
      },
      {
        path: 'security',
        canActivate: [authGuard],
        loadComponent: () => import('./pages/account-security/account-security').then(m => m.AccountSecurity),
        title: 'Seguridad de la cuenta · LoanCalc RD'
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
