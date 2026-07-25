# Historial de cambios

Todos los cambios importantes de LoanCalc RD se documentarán en este archivo.

El proyecto sigue un esquema de versionado semántico.

## [2.1.0] - 2026-07-25

### Añadido

- Simulación de abonos extraordinarios al capital.
- Abonos únicos y mensuales.
- Estrategias para reducir el plazo o recalcular la cuota.
- Cálculo de intereses y meses ahorrados.
- Nueva tabla de amortización con abonos extraordinarios.
- Comparación visual antes y después.
- Indicadores porcentuales de ahorro.
- Exportación del escenario de abonos a PDF.
- Exportación del escenario de abonos a Excel con hojas de resumen, comparación y amortización.
- Dashboard financiero con indicadores ejecutivos.
- LoanCalc Score para evaluar el costo financiero.
- Recomendaciones financieras automáticas.
- Línea de tiempo estimada del préstamo.
- Formato automático con separadores de miles en el monto solicitado.
- Pruebas automatizadas para el motor de abonos extraordinarios.

### Mejorado

- Presentación de resultados financieros.
- Visualización en tema oscuro.
- Diseño responsive del módulo de resultados.
- Validación de datos financieros.
- Organización de los reportes PDF y Excel.
- Experiencia de introducción de montos.
- Cobertura de pruebas del núcleo financiero.

### Corregido

- Compatibilidad de `NgClass` con el componente standalone de resultados.
- Cálculo de préstamos con tasa de interés igual a cero.
- Balance final de la tabla de amortización.
- Manejo de abonos superiores al balance pendiente.

## [2.0.0] - 2026-07-21

### Añadido

- Validación de cédula dominicana mediante algoritmo Luhn.
- Historial local de simulaciones.
- Comparador de escenarios financieros.
- Exportación a Excel.
- Tema oscuro.
- Visualizaciones financieras.
- Pruebas automatizadas.
- Integración continua con GitHub Actions.
- Licencia MIT.