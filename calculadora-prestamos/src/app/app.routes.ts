import { isDevMode } from '@angular/core';
import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { Calculator } from './pages/calculator/calculator';
import { Results } from './pages/results/results';
import { Account } from './pages/account/account';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'calculator', component: Calculator },
  { path: 'results', component: Results },
  // Account UI remains development-only until verified email, refresh and hosted API are ready.
  ...(isDevMode() ? [{ path: 'account', component: Account }] : []),
  { path: '**', redirectTo: '' }
];
