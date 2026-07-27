<p align="center">
  <img
    src="calculadora-prestamos/public/assets/img/logo-loancalc-rd.png"
    alt="Logo de LoanCalc RD"
    width="320"
  />
</p>

<p align="center">
  <strong>Simulador financiero dominicano para calcular, analizar y comparar préstamos amortizados.</strong><br>
  Desarrollado con Angular y TypeScript.
</p>

<p align="center">
  <img alt="Versión" src="https://img.shields.io/badge/versión-2.1.0-0d6efd" />
  <img alt="Licencia" src="https://img.shields.io/badge/licencia-MIT-success" />
  <img alt="Estado" src="https://img.shields.io/badge/estado-estable-success" />
  <img alt="Pruebas" src="https://img.shields.io/badge/pruebas-22%20aprobadas-success" />
  <a href="https://github.com/Jairo0811/CalculadoraPrestamos/actions/workflows/ci.yml">
    <img alt="Integración continua" src="https://github.com/Jairo0811/CalculadoraPrestamos/actions/workflows/ci.yml/badge.svg" />
  </a>
</p>

<p align="center">
  <a href="#-descripción">Descripción</a> ·
  <a href="#-novedades-de-la-versión-210">Novedades</a> ·
  <a href="#️-tecnologías-utilizadas">Tecnologías</a> ·
  <a href="#-funcionalidades">Funcionalidades</a> ·
  <a href="#-instalación-y-ejecución">Instalación</a> ·
  <a href="#-estado-del-proyecto">Estado</a>
</p>

---

## 📖 Descripción

**LoanCalc RD** es una aplicación web orientada al mercado dominicano que permite simular préstamos amortizados mediante el método francés. Calcula automáticamente la cuota mensual, los intereses, el total pagado y el calendario completo de amortización.

La versión **2.1.0** incorpora simulación de abonos extraordinarios, estrategias para reducir el plazo o recalcular la cuota, comparación antes y después, indicadores de ahorro, dashboard financiero, LoanCalc Score, recomendaciones automáticas y exportaciones especializadas a PDF y Excel.

El proyecto nació en **2020** como un ejercicio práctico propuesto por **Gerson Santos Mateo** para fortalecer el aprendizaje de Angular. En **2026** fue reconstruido y evolucionado hasta convertirse en una aplicación moderna, responsive y accesible.

---

## 🆕 Novedades de la versión 2.1.0

- Simulación de abonos extraordinarios únicos y mensuales.
- Reducción del plazo o recálculo de la cuota restante.
- Cálculo de intereses y meses ahorrados.
- Nueva tabla de amortización con abonos extraordinarios.
- Comparación visual entre el escenario original y el nuevo escenario.
- Dashboard financiero con indicadores ejecutivos.
- LoanCalc Score para evaluar el costo financiero.
- Recomendaciones financieras automáticas.
- Línea de tiempo estimada del préstamo.
- Exportación del escenario de abonos a PDF y Excel.
- Formato automático de montos con separadores de miles.
- Soporte para préstamos con tasa de interés igual a cero.
- Cobertura ampliada a **22 pruebas unitarias**.

Consulta el historial completo en [`CHANGELOG.md`](CHANGELOG.md).

---

## 🛠️ Tecnologías utilizadas

### 🎨 Frontend y diseño de interfaces

<p>
  <img src="https://skillicons.dev/icons?i=angular,ts,html,css,bootstrap" alt="Angular, TypeScript, HTML, CSS y Bootstrap" />
</p>

- **Angular:** aplicación web SPA y arquitectura basada en componentes.
- **TypeScript:** lógica financiera, modelos, servicios, validadores y tipado estático.
- **HTML5:** estructura semántica y accesible de formularios, resultados y reportes.
- **CSS3:** diseño responsive, dashboard, visualizaciones y tema oscuro.
- **Bootstrap 5:** componentes visuales y utilidades responsivas.

### 📊 Lógica financiera, reportes y exportación

- **Método francés de amortización:** cálculo de cuotas, capital, intereses y balance pendiente.
- **jsPDF:** generación de reportes financieros en PDF.
- **jsPDF AutoTable:** construcción de tablas de amortización y comparación en PDF.
- **QRCode:** incorporación de códigos QR en los reportes.
- **SpreadsheetML:** exportación de libros compatibles con Microsoft Excel.

### 🧪 Calidad e integración continua

- **Vitest:** pruebas automatizadas de cálculos, validaciones y escenarios financieros.
- **GitHub Actions:** ejecución automática del build y de las pruebas en integración continua.

### 🧰 Herramientas de desarrollo

<p>
  <img src="https://skillicons.dev/icons?i=vscode,git,github,npm" alt="Visual Studio Code, Git, GitHub y npm" />
</p>

- **Visual Studio Code:** entorno principal de desarrollo.
- **npm:** gestión de dependencias y scripts del proyecto.
- **Git:** control de versiones.
- **GitHub:** publicación del repositorio, documentación e integración continua.

---

## ✨ Funcionalidades

### 👤 Datos del solicitante

- ✅ Nombre y apellido.
- ✅ Fecha de nacimiento y cálculo automático de edad.
- ✅ Formato automático de cédula `000-0000000-0`.
- ✅ Validación de cédula dominicana mediante algoritmo Luhn.
- ✅ Mensajes de validación accesibles y específicos.

### 💰 Simulación del préstamo

- ✅ Préstamos personales, hipotecarios, de vehículo, educativos y comerciales.
- ✅ Monto, tasa anual y plazo en meses.
- ✅ Formato automático del monto con separadores de miles.
- ✅ Cálculo de cuota mensual.
- ✅ Cálculo de capital, intereses y total a pagar.
- ✅ Manejo de préstamos con tasa de interés igual a cero.
- ✅ Calendario completo de pagos.

### 💸 Abonos extraordinarios

- ✅ Abono único en un mes específico.
- ✅ Abonos mensuales recurrentes.
- ✅ Estrategia para reducir el plazo.
- ✅ Estrategia para recalcular la cuota restante.
- ✅ Cálculo de intereses ahorrados.
- ✅ Cálculo de meses ahorrados.
- ✅ Total abonado extraordinariamente.
- ✅ Nueva tabla de amortización especializada.
- ✅ Identificación visual de los meses con abonos.

### 📊 Análisis financiero

- ✅ Distribución visual entre capital e intereses.
- ✅ Gráfica de evolución del balance restante.
- ✅ Tabla de amortización responsive.
- ✅ Comparador de escenarios por entidad financiera.
- ✅ Identificación automática de la opción con menor cuota.
- ✅ Dashboard financiero con indicadores ejecutivos.
- ✅ LoanCalc Score.
- ✅ Relación entre interés y capital.
- ✅ Costo financiero mensual y anual promedio.
- ✅ Comparación visual antes y después.
- ✅ Porcentaje de ahorro en intereses y plazo.
- ✅ Recomendaciones financieras automáticas.
- ✅ Línea de tiempo estimada del préstamo.

> Las tasas del comparador son introducidas por el usuario y no representan ofertas oficiales de entidades financieras.

### 📤 Exportación y uso compartido

- ✅ Reporte profesional del préstamo en PDF.
- ✅ Reporte específico de abonos extraordinarios en PDF.
- ✅ Logo, número de reporte y código QR.
- ✅ Numeración automática de páginas.
- ✅ Exportación compatible con Microsoft Excel.
- ✅ Libro Excel de abonos con hojas de resumen, comparación y amortización.
- ✅ Compartir por WhatsApp, Facebook y LinkedIn.
- ✅ Copiar resumen financiero al portapapeles.

### 🕘 Historial y personalización

- ✅ Historial local de hasta 20 simulaciones.
- ✅ Carga de simulaciones anteriores.
- ✅ Eliminación individual o limpieza completa.
- ✅ Tema claro y oscuro persistente.
- ✅ Compatibilidad con la preferencia visual del sistema.

### ♿ Accesibilidad y responsive

- ✅ Navegación mediante teclado.
- ✅ Foco visible.
- ✅ Etiquetas ARIA y regiones accesibles.
- ✅ Contraste optimizado.
- ✅ Compatibilidad con reducción de movimiento.
- ✅ Diseño adaptado para móviles, tabletas y escritorio.

---

## 📂 Estructura principal

```text
CalculadoraPrestamos
│
├── calculadora-prestamos
│   ├── src
│   │   ├── app
│   │   │   ├── core
│   │   │   │   ├── models
│   │   │   │   ├── services
│   │   │   │   └── validators
│   │   │   ├── pages
│   │   │   │   ├── calculator
│   │   │   │   └── results
│   │   │   └── shared
│   │   └── assets
│   │       └── img
│   ├── angular.json
│   ├── package.json
│   └── package-lock.json
│
├── legacy
├── CHANGELOG.md
├── LICENSE
├── THIRD_PARTY_NOTICES.md
└── README.md
```

La carpeta `legacy` conserva la implementación original del proyecto para fines históricos y comparativos.

---

## 🚀 Instalación y ejecución

### 1. Clonar el repositorio

```bash
git clone https://github.com/Jairo0811/CalculadoraPrestamos.git
cd CalculadoraPrestamos/calculadora-prestamos
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Ejecutar en desarrollo

```bash
npm start
```

La aplicación estará disponible en:

```text
http://localhost:4200
```

### 4. Compilar para producción

```bash
npm run build
```

### 5. Ejecutar pruebas

```bash
npm test
```

Para integración continua:

```bash
npm run test:ci
```

---

## 📊 Estado del proyecto

| Módulo | Estado |
|---|:---:|
| 👤 Datos del solicitante | ✅ |
| 🇩🇴 Validación Luhn de cédula | ✅ |
| 💰 Simulación de préstamos | ✅ |
| 💸 Abonos extraordinarios | ✅ |
| 📊 Tabla de amortización | ✅ |
| 📈 Visualizaciones financieras | ✅ |
| 🧭 Dashboard financiero | ✅ |
| 🧠 LoanCalc Score y recomendaciones | ✅ |
| 🏦 Comparador de escenarios | ✅ |
| 📄 Exportación PDF | ✅ |
| 📗 Exportación Excel | ✅ |
| 🔳 Código QR | ✅ |
| 📤 Compartir simulación | ✅ |
| 🕘 Historial local | ✅ |
| 🌙 Tema oscuro | ✅ |
| ♿ Accesibilidad | ✅ |
| 📱 Responsive Design | ✅ |
| 🧪 Pruebas automatizadas | ✅ — 22 pruebas |
| ⚙️ Integración continua | ✅ |

---

## 🧪 Calidad y validación

La versión 2.1.0 fue validada mediante:

- **22 pruebas unitarias aprobadas**.
- Build de producción exitoso.
- Integración continua mediante GitHub Actions.
- Validación de escenarios con tasa 0%.
- Validación de abonos superiores al balance pendiente.
- Verificación en tema claro, tema oscuro y diseño responsive.

---

## 💡 Origen del proyecto

LoanCalc RD fue inspirado en el siguiente ejercicio propuesto en 2020 por **Gerson Santos Mateo**:

> “El ejercicio después que tengas todo eso estudiado será hacer una calculadora de préstamos amortizada, donde el usuario pueda insertar la cantidad que desea prestada, seleccionar los años que tendrá el préstamo y por último seleccionar qué tipo de préstamo será: hipotecario, automotriz o personal.”

Este proyecto representa la evolución de aquella idea inicial hacia una aplicación financiera moderna.

---

## 📜 Licencia y atribuciones

LoanCalc RD se distribuye bajo la **Licencia MIT**. Consulta el archivo [`LICENSE`](LICENSE).

La validación de cédula mediante Luhn fue adaptada de la implementación pública de **OGTIC Cuenta Única Registry**, también licenciada bajo MIT. Consulta [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

---

## 👨‍💻 Autor

**Francis Jairo Matías Rosario**

Idea original del ejercicio: **Gerson Santos Mateo**

---

<p align="center">
  Desarrollado con ❤️ utilizando Angular<br>
  LoanCalc RD · 2020 — Presente
</p>