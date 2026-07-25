import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

interface CuotaAmortizacion {
  numero: number;
  fechaPago: string;
  cuota: number;
  interes: number;
  capital: number;
  balance: number;
}

interface ResultadoPrestamo {
  nombre: string;
  apellido: string;
  fechaNacimiento: string;
  cedula: string;
  edad: number | null;
  monto: number;
  tasa: number;
  duracion: number;
  tipoPrestamo: string;
  cuotaMensual: number;
  totalPagar: number;
  totalInteres: number;
  tablaAmortizacion: CuotaAmortizacion[];
}

@Component({
  selector: 'app-calculadora',
  templateUrl: './calculadora.component.html',
  styleUrls: ['./calculadora.component.css']
})
export class CalculadoraComponent implements OnInit {
  nombre = '';
  apellido = '';
  fechaNacimiento = '';
  cedula = '';
  monto: number = null;
  tasa: number = null;
  duracion: number = null;
  tipoPrestamo = '';
  mensajeError = '';

  constructor(private router: Router) { }

  ngOnInit(): void {
  }

  calcularPrestamo(): void {
    this.mensajeError = '';

    if (!this.nombre || !this.apellido || !this.cedula || !this.monto || !this.tasa || !this.duracion || !this.tipoPrestamo) {
      this.mensajeError = 'Completa todos los campos obligatorios antes de calcular el préstamo.';
      return;
    }

    if (this.monto <= 0 || this.tasa <= 0 || this.duracion <= 0) {
      this.mensajeError = 'El monto, la tasa y la duración deben ser mayores que cero.';
      return;
    }

    const tasaMensual = (this.tasa / 100) / 12;
    const cuotaMensual = this.monto * (tasaMensual * Math.pow(1 + tasaMensual, this.duracion)) /
      (Math.pow(1 + tasaMensual, this.duracion) - 1);

    const tablaAmortizacion = this.generarTablaAmortizacion(this.monto, tasaMensual, cuotaMensual, this.duracion);
    const totalPagar = cuotaMensual * this.duracion;
    const totalInteres = totalPagar - this.monto;

    const resultado: ResultadoPrestamo = {
      nombre: this.nombre,
      apellido: this.apellido,
      fechaNacimiento: this.fechaNacimiento,
      cedula: this.cedula,
      edad: this.calcularEdad(this.fechaNacimiento),
      monto: this.monto,
      tasa: this.tasa,
      duracion: this.duracion,
      tipoPrestamo: this.tipoPrestamo,
      cuotaMensual: cuotaMensual,
      totalPagar: totalPagar,
      totalInteres: totalInteres,
      tablaAmortizacion: tablaAmortizacion
    };

    localStorage.setItem('resultadoPrestamo', JSON.stringify(resultado));
    this.router.navigate(['/resultados']);
  }

  limpiarFormulario(): void {
    this.nombre = '';
    this.apellido = '';
    this.fechaNacimiento = '';
    this.cedula = '';
    this.monto = null;
    this.tasa = null;
    this.duracion = null;
    this.tipoPrestamo = '';
    this.mensajeError = '';
  }

  private generarTablaAmortizacion(monto: number, tasaMensual: number, cuotaMensual: number, duracion: number): CuotaAmortizacion[] {
    const tabla: CuotaAmortizacion[] = [];
    let balance = monto;
    const fechaActual = new Date();

    for (let i = 1; i <= duracion; i++) {
      const interes = balance * tasaMensual;
      const capital = cuotaMensual - interes;
      balance = balance - capital;

      const fechaPago = new Date(fechaActual.getFullYear(), fechaActual.getMonth() + i, fechaActual.getDate());

      tabla.push({
        numero: i,
        fechaPago: fechaPago.toLocaleDateString('es-DO'),
        cuota: cuotaMensual,
        interes: interes,
        capital: capital,
        balance: balance > 0 ? balance : 0
      });
    }

    return tabla;
  }

  private calcularEdad(fechaNacimiento: string): number | null {
    if (!fechaNacimiento) {
      return null;
    }

    const nacimiento = new Date(fechaNacimiento);
    const hoy = new Date();
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const diferenciaMes = hoy.getMonth() - nacimiento.getMonth();

    if (diferenciaMes < 0 || (diferenciaMes === 0 && hoy.getDate() < nacimiento.getDate())) {
      edad--;
    }

    return edad;
  }
}
