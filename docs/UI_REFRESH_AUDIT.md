# LoanCalc RD — Auditoría del UI Refresh «Fintech Premium»

Auditoría de la versión pública en `master` (`461301a`, Angular 22.2 · TypeScript 6.0) antes del rediseño, con las decisiones que guían la implementación. Las cifras de esta sección son mediciones reales del build de producción servido localmente; el informe final con la comparación antes/después está al final del documento.

## 1. Línea base verificada

| Verificación | Resultado (antes) |
|---|---|
| `npm run test:ci` (Vitest) | 101/101 |
| `npm run test:adsense` | 6/6 |
| `npm run e2e` (desarrollo, 3 dispositivos) | 35 aprobadas, 1 omitida a propósito |
| `npm run e2e:smoke` (build de producción) | 30 aprobadas, 9 omitidas (solo aplican al sitio publicado) |
| Transferencia inicial estimada | 152.03 kB (JS 115.87 kB + CSS 36.17 kB) |
| Chunk de resultados | 80.99 kB brutos · 16.11 kB transferidos |
| jsPDF / AutoTable | Carga diferida (113.02 kB + 9.06 kB) |
| Desbordamiento horizontal | Ninguno en 320, 360, 390, 414, 768, 1024 y 1440 px |
| Errores de consola | Ninguno |
| Altura de resultados en móvil (390 px) | 9,421 px |

## 2. Hallazgos

Severidad: **Alta** = afecta la comprensión o el uso; **Media** = inconsistencia visible o deuda que frena cambios; **Baja** = pulido.

| # | Severidad | Hallazgo (reproducible) | Decisión |
|---|---|---|---|
| H1 | Alta | Tras pulsar «Calcular préstamo», resultados se abre desplazado: `scrollY` = 153 px en escritorio y **1,191 px en móvil** (el resumen queda fuera de vista). Causa: `html { scroll-behavior: smooth }` convierte el «volver arriba» del router en una animación que se interrumpe al cambiar la altura de la página. El foco queda en `<body>`. | Retirar el desplazamiento suave global; al cambiar de ruta, ir arriba de forma instantánea y mover el foco al título de la nueva página. |
| H2 | Alta | Resultados presenta 14 bloques al mismo nivel. La cuota mensual es una tarjeta más entre cuatro; la tabla de amortización está al final, a 9,400 px en móvil. | Cuota como cifra protagonista, secciones ordenadas (Resumen → Análisis → Abonos → Comparador → Amortización → Guardar y compartir) y navegación interna accesible. |
| H3 | Alta | Abonos extraordinarios repite el ahorro tres veces (4 tarjetas, «Impacto», flechas de plazo) y no explica de antemano en qué meses se aplicará el abono. | Un único comparativo «Original vs. con abonos» (tabla semántica) y una vista previa de los meses previstos según la frecuencia. |
| H4 | Media | «Nueva simulación» usa `btn-danger` (rojo de acción destructiva) y las cinco acciones tienen el mismo peso; en móvil se apilan cinco botones a ancho completo. | Jerarquía: exportaciones como acción principal, el resto secundarias, sin colores semánticos fuera de contexto. |
| H5 | Media | El LoanCalc Score no explica en pantalla que es un indicador matemático interno; puede leerse como puntaje crediticio. | Texto explícito junto a la calificación y escala visible (umbrales sin cambios). |
| H6 | Media | Calculadora en móvil: el hero ocupa ~480 px antes del formulario y el `h1` visible no existe (el `h1` real es «LoanCalc RD», oculto). | Cabecera compacta con `h1` «Calcula tu préstamo»; logotipo solo donde aporta. |
| H7 | Media | Encabezado móvil reducido a iconos sin texto. | Navegación compacta con icono y etiqueta visibles y estado activo evidente. |
| H8 | Media | CSS: 94.4 KB de autoría propia; `home.css` y `calculator.css` minificados en líneas de 8,665 y 7,336 caracteres; 561 colores hex y 111 `rgba()` frente a 102 usos de tokens `--lc-*`; 50 `!important`. | Reescritura formateada sobre tokens; `!important` solo donde Bootstrap lo exige o en `prefers-reduced-motion`. |
| H9 | Media | `results-refresh.css` es una hoja **global** (añadida en `angular.json`) que sobrescribe `results.css`; 39 reglas para `[data-theme='dark']`, que nada en la aplicación activa. | Fusionar en el componente de resultados y retirar las reglas de modo oscuro (código muerto verificado). |
| H10 | Media | Tablas de amortización sin columnas numéricas alineadas, sin indicación de desplazamiento y con cabecera que se pierde al bajar. | Cifras tabulares alineadas a la derecha, cabecera y primera columna fijas dentro del contenedor, indicación de desplazamiento en pantallas estrechas. |
| H11 | Baja | Portada: la franja de capacidades, las 6 tarjetas de funciones y las 4 tarjetas «Cómo funciona» repiten los mismos mensajes; el texto de abonos menciona solo «únicos o mensuales» aunque ya existen abonos anuales. | Composición variada sin repetición y texto actualizado con la frecuencia anual. |
| H12 | Baja | Gráfico de balance sin escalas ni etiquetas (SVG estirado); el donut depende del color. | Ejes con valores en RD$ y meses, línea comparativa cuando hay abonos, leyendas con importes. |

## 3. Riesgos y restricciones

- **Motor financiero intocable:** no se modifican `LoanCalculatorService`, el método francés, el redondeo, los límites ni la periodicidad de los abonos. El LoanCalc Score conserva sus umbrales (15 / 25 / 40 / 60 %); se extraen a una función pura con pruebas de frontera.
- **Exportaciones:** PDF y Excel (generales y de abonos, incluido el QR) no cambian; se mantienen sus nombres accesibles y la carga diferida de jsPDF.
- **AdSense y SEO:** sin cambios en `index.html` (verificación, metadatos, canónica), `configure-adsense.mjs`, `robots.txt`, `sitemap.xml`, `_headers`, `_redirects` ni páginas legales.
- **Cuentas:** desactivadas en producción; solo se armoniza su apariencia mediante tokens.
- **Pruebas:** se adaptan solo donde cambia la interacción (por ejemplo, la frecuencia pasa de `<select>` a botones de opción nativos), verificando el mismo comportamiento por rol y nombre accesible.

## 4. Decisiones de diseño

- **Base técnica:** Bootstrap 5 + CSS propio sobre tokens `--lc-*` ampliados (color, tipografía fluida, espaciado de 4 px, radios, elevación). Sin nuevas dependencias ni fuentes externas.
- **Tema:** exclusivamente claro.
- **Movimiento:** transiciones de 150–200 ms solo en estados interactivos; nada animado con `prefers-reduced-motion`.
- **Separación móvil:** 24 px entre tarjetas independientes; objetivos táctiles ≥ 44 × 44 px.
- **Controles nativos:** `<input type="radio">` para frecuencia y estrategia, `<table>` para comparaciones y enlaces de anclaje para la navegación interna.
