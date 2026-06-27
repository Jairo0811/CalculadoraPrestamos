import { Routes } from '@angular/router';
import { Calculator } from './pages/calculator/calculator';
import { Results } from './pages/results/results';

export const routes: Routes = [
  { path: '', redirectTo: 'calculator', pathMatch: 'full' },
  { path: 'calculator', component: Calculator },
  { path: 'results', component: Results },
  { path: '**', redirectTo: 'calculator' }
];