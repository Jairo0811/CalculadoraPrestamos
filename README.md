# 💰 LoanCalc RD - Simulador Profesional de Préstamos 🧮

<p align="center">
  <img src="https://skillicons.dev/icons?i=angular,ts,html,css,bootstrap&perline=5" />
</p>

<p align="center">
  <img src="https://skillicons.dev/icons?i=vscode,git,github,npm&perline=4" />
</p>

<p align="center">
<strong>Simulador profesional de préstamos amortizados.</strong><br>
Desarrollado con Angular y TypeScript.
</p>

---

# 📖 Descripción

**LoanCalc RD** es una aplicación web desarrollada para calcular préstamos amortizados mediante el método francés de amortización.

La aplicación permite simular préstamos personales, hipotecarios y automotrices, calculando automáticamente la cuota mensual, el interés generado, el total pagado y el calendario completo de amortización.

Además, genera un **reporte profesional en PDF**, incluyendo el resumen financiero del préstamo, información del solicitante, código QR del proyecto y una tabla detallada de pagos.

LoanCalc RD nació originalmente en el año **2020** como un ejercicio práctico propuesto por **Gerson Santos Mateo**, con el objetivo de fortalecer el aprendizaje de Angular mediante el desarrollo de una calculadora de préstamos amortizada.

En **2026** el proyecto fue completamente reconstruido utilizando Angular moderno, mejorando tanto la experiencia visual como la arquitectura del sistema.

---

# 🛠️ Tecnologías Utilizadas

<p align="center">
<img src="https://skillicons.dev/icons?i=angular,ts,html,css,bootstrap,vscode,git,github,npm" />
</p>

| Tecnología | Descripción |
|------------|-------------|
| 🅰️ Angular | Desarrollo del Frontend |
| 📘 TypeScript | Lógica de negocio |
| 🌐 HTML5 | Estructura de la interfaz |
| 🎨 CSS3 | Diseño y estilos |
| 🅱️ Bootstrap 5 | Componentes responsivos |
| 📄 jsPDF | Generación de reportes PDF |
| 📑 jsPDF AutoTable | Tablas profesionales en PDF |
| 🔳 QRCode | Generación de códigos QR |

---

# ✨ Funcionalidades

## 👤 Datos del solicitante

- ✅ Registro del nombre y apellido
- ✅ Validación de cédula dominicana
- ✅ Fecha de nacimiento
- ✅ Cálculo automático de edad

## 💰 Simulación del préstamo

- ✅ Préstamos personales
- ✅ Préstamos hipotecarios
- ✅ Préstamos automotrices
- ✅ Monto solicitado
- ✅ Tasa anual
- ✅ Cantidad de meses
- ✅ Cálculo automático de cuota mensual
- ✅ Cálculo de intereses
- ✅ Total a pagar

## 📊 Tabla de amortización

- ✅ Calendario completo de pagos
- ✅ Capital amortizado
- ✅ Intereses pagados
- ✅ Balance restante
- ✅ Fechas de pago

## 📄 Reporte Profesional PDF

- ✅ Logo corporativo
- ✅ Número de reporte único
- ✅ Información del cliente
- ✅ Información del préstamo
- ✅ Resumen financiero
- ✅ Tabla de amortización
- ✅ Código QR del proyecto
- ✅ Numeración automática de páginas
- ✅ Diseño profesional listo para impresión

---

# 📂 Estructura del Proyecto

```text
LoanCalcRD
│
├── src
│   ├── app
│   │   ├── core
│   │   │   ├── models
│   │   │   └── services
│   │   │
│   │   ├── pages
│   │   │   ├── calculator
│   │   │   └── results
│   │   │
│   │   └── shared
│   │
│   └── assets
│       └── img
│
├── public
│
├── angular.json
├── package.json
└── README.md
```

---

# 🚀 Instalación

## 📥 Clonar el proyecto

```bash
git clone https://github.com/Jairo0811/CalculadoraPrestamos.git
```

Entrar a la carpeta:

```bash
cd CalculadoraPrestamos
```

---

## 📦 Instalar dependencias

```bash
npm install
```

---

## ▶ Ejecutar la aplicación

```bash
ng serve -o
```

La aplicación estará disponible en:

```text
http://localhost:4200
```

---

# 📊 Estado del Proyecto

| Módulo | Estado |
| ------- | :----: |
| 👤 Datos del solicitante | ✅ |
| 💰 Simulación de préstamos | ✅ |
| 📊 Tabla de amortización | ✅ |
| 📄 Exportación PDF | ✅ |
| 🔳 Código QR | ✅ |
| 🇩🇴 Validación de cédula | ✅ |
| 📱 Responsive Design | ✅ |

---

# 💡 Origen del Proyecto

LoanCalc RD fue inspirado en el siguiente ejercicio académico propuesto en el año **2020** por el desarrollador **Gerson Santos Mateo**:

> *"El ejercicio después que tengas todo eso estudiado será hacer una calculadora de préstamos amortizada, donde el usuario pueda insertar la cantidad que desea prestada, seleccionar los años que tendrá el préstamo y por último seleccionar qué tipo de préstamo será: hipotecario, automotriz o personal."*

Este proyecto representa la evolución de aquel ejercicio inicial hacia una aplicación moderna desarrollada como proyecto personal.

---

# 👨‍💻 Autores

**Francis Jairo Matías Rosario**

**Gerson Santos Mateo**

---

<p align="center">

Desarrollado con ❤️ utilizando Angular

LoanCalc RD • 2020 — Presente

</p>
