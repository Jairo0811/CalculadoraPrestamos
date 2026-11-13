import { render, screen, userEvent } from '@ng-native/testing';
import { expect, test } from 'vitest';
import { App } from './app.ts';
test('renderiza la calculadora nativa y permite simular', async()=>{
  await render(App);
  expect(screen.getByText('Calcula tu cuota')).toBeTruthy();
  await userEvent.setup().press(screen.getByRole('button',{name:'Calcular préstamo'}));
  expect(screen.getByText('CUOTA MENSUAL ESTIMADA')).toBeTruthy();
  expect(screen.getByText('Primeras 6 cuotas')).toBeTruthy();
});
