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

## 5. Informe final (antes / después)

Mediciones reales sobre el build de producción servido localmente (mismo servidor estático con fallback SPA para ambas versiones). Antes = `461301a`; después = rama `feat/loancalcrd-fintech-premium-ui-refresh`.

### 5.1 Pruebas

| Verificación | Antes | Después |
|---|---|---|
| `npm ci` | — | Correcto, 0 vulnerabilidades |
| `npm run test:ci` (Vitest) | 101/101 | **134/134** (20 archivos) |
| `npm run test:adsense` | 6/6 | 6/6 |
| `npm run build` | Correcto | Correcto |
| `npm run e2e` (3 dispositivos) | 35 aprobadas, 1 omitida | **89 aprobadas**, 1 omitida (la misma, a propósito) |
| `npm run e2e:smoke` (build de producción) | 30 aprobadas, 9 omitidas | 30 aprobadas, 9 omitidas (solo aplican al sitio publicado); ahora también analiza `/results` con axe |

Regresiones cubiertas explícitamente: tasa 0 % rechazada y tasa positiva, validaciones y foco, cuota y amortización completa (36 filas), abonos único, mensual y anual, reducir plazo y reducir cuota, exportaciones PDF/Excel y QR (smoke), historial, comparador, LoanCalc Score, compartir, cuentas desactivadas (smoke), rutas legales, desbordamiento y WCAG A/AA con axe en las rutas públicas y en resultados con abonos.

### 5.2 Rendimiento

| Métrica | Antes | Después | Diferencia |
|---|---|---|---|
| Transferencia inicial estimada (Angular) | 152.03 kB | **150.72 kB** | −1.31 kB |
| Hoja global `styles` (transferencia) | 36.17 kB | 35.45 kB | −0.72 kB |
| Chunk de resultados (bruto / transferencia) | 80.99 / 16.11 kB | 97.37 / 19.81 kB | +16.38 / +3.70 kB |
| jsPDF / AutoTable | Diferidos (113.02 / 9.06 kB) | Diferidos (113.02 / 9.06 kB) | Sin cambio |
| CSS propio minificado (csso) / gzip | 83.3 / 23.9 kB | **74.3 / 19.4 kB** | −10.8 % / −18.9 % |

El chunk de resultados crece porque la plantilla incorpora navegación interna, escala del Score, calendario previsto, tabla comparativa y totales; su CSS, en cambio, baja de 32.9 kB (`results.css` + `results-refresh.css` global) a 23.7 kB minificados. Sin dependencias ni fuentes nuevas.

**Laboratorio local** (Chromium, 390 × 844, CPU ×4, sin red real, mediana de 5): no son datos de campo (CrUX) y no sustituyen a PageSpeed Insights sobre el sitio publicado.

| | Antes | Después |
|---|---|---|
| LCP `/` | 832 ms | 804 ms |
| LCP `/calculator` | 968 ms | 808 ms |
| LCP `/guide` | 728 ms | 688 ms |
| CLS (`/`, `/calculator`, `/guide`, hasta resultados) | 0 – 0.0002 | 0 – 0.0002 |
| Latencia de interacción «Calcular préstamo» (Event Timing) | 80 ms | 88 ms |
| Latencia de interacción «Calcular ahorro» | 224 ms | 136 ms |

### 5.3 CSS

| | Antes | Después |
|---|---|---|
| Líneas (formateado) / línea más larga | 2,407 / 8,665 caracteres | 4,074 / 153 caracteres |
| `!important` | 50 | 5 (movimiento reducido e impresión de `.no-print`) |
| Colores hex / `rgba()` | 561 / 111 | 145 / 33 |
| Usos de tokens `--lc-*` | 102 | 1,014 |
| Reglas de modo oscuro | 39 | 0 |
| Hojas globales | 2 (`styles.css`, `results-refresh.css`) | 1 (`styles.css`) |

### 5.4 Hallazgos resueltos

| # | Estado |
|---|---|
| H1 | Resuelto: tras «Calcular préstamo», `scrollY` = 0 en escritorio y móvil y el foco está en «Resumen del préstamo» (E2E). Bootstrap también activa el desplazamiento suave en `:root`; se anula. |
| H2 | Resuelto: cuota protagonista, secciones ordenadas y navegación interna con `aria-current`. |
| H3 | Resuelto: un comparativo único y calendario previsto. |
| H4 | Resuelto: PDF principal; Excel, Nueva simulación y Volver secundarias; dos filas de botones en móvil. |
| H5 | Resuelto: texto «No es un puntaje de crédito» y escala visible; umbrales sin cambios (pruebas de frontera). |
| H6 | Resuelto: `h1` visible y sin héroe de 480 px. |
| H7 | Resuelto: icono y etiqueta visibles en móvil. |
| H8 | Resuelto (ver 5.3). |
| H9 | Resuelto: `results-refresh.css` eliminado de `angular.json`. |
| H10 | Resuelto: cabecera y primera columna fijas, cifras tabulares a la derecha, indicación de desplazamiento y región accesible por teclado. |
| H11 | Resuelto. |
| H12 | Resuelto. |

Desbordamiento horizontal: ninguno en 320, 360, 390, 414, 768, 1024 y 1440 px para `/`, `/calculator`, `/guide`, `/about`, `/contact`, `/privacy`, `/terms` y resultados con abonos anuales. Sin errores de consola.

### 5.5 Capturas

Comparaciones en [`docs/ui-refresh/`](ui-refresh/) (WebP, antes a la izquierda):

- [Portada, escritorio](ui-refresh/home-escritorio.webp) · [Portada, móvil](ui-refresh/home-movil.webp)
- [Calculadora, escritorio](ui-refresh/calculadora-escritorio.webp) · [Calculadora, móvil](ui-refresh/calculadora-movil.webp)
- [Resultados, escritorio](ui-refresh/resultados-escritorio.webp) · [Resultados, móvil](ui-refresh/resultados-movil.webp) — la captura «antes» muestra el hallazgo H1: la página se abría a la altura del historial.
- [Abonos anuales](ui-refresh/abonos-anuales-escritorio.webp) · [Amortización, móvil](ui-refresh/amortizacion-movil.webp)
- [Navegación móvil](ui-refresh/navegacion-movil.webp) · [Historial, móvil](ui-refresh/historial-movil.webp) · [Guía](ui-refresh/guia-escritorio.webp)

### 5.6 Riesgos y pendientes

- **Selectores E2E adaptados:** la frecuencia de abonos pasa de `<select>` a botones de opción; las pruebas la eligen por rol y nombre (`radio` «Abono anual»). La prueba de espaciado móvil ahora comprueba todos los pares de tarjetas apiladas.
- **Pantalla de resultados más larga en móvil** (≈10,200 px frente a 9,421 px) por el calendario previsto y la tabla comparativa; la navegación interna permite saltar a cada sección.
- **Rendimiento real:** solo se midió en laboratorio local; conviene revisar PageSpeed Insights y Search Console tras publicar.
- **Cuentas:** solo cambió su apariencia (tokens); siguen desactivadas en producción y sin cambios de lógica.
