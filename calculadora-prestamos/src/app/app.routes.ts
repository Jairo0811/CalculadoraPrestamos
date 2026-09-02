import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { Calculator } from './pages/calculator/calculator';
import { Results } from './pages/results/results';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'calculator', component: Calculator },
  { path: 'results', component: Results },
  { path: '**', redirectTo: '' }
];
