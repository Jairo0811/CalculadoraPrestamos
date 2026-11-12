# LoanCalc RD — Sistema de diseño

Convenciones visuales del frontend Angular. Fuente única: `calculadora-prestamos/src/styles.css` (tokens y primitivas globales); cada pantalla aplica los tokens en el CSS de su componente.

## Principios

1. **Claridad financiera primero.** La cifra que responde a la pregunta del usuario (la cuota mensual estimada) es la más grande de la pantalla; el resto la acompaña sin competir.
2. **Exclusivamente claro.** No hay modo oscuro ni reglas `[data-theme='dark']`.
3. **Sobrio.** Sombras sutiles, un solo color de acento (azul de marca), movimiento solo en estados interactivos.
4. **Identidad preservada.** Nombre LoanCalc RD, logotipos oficiales de `public/assets/img/`, azul/navy corporativo, formato `RD$ 1,234.56`, textos en español.
5. **Educativo, no comercial.** Las cifras de ejemplo se rotulan como ilustrativas; el LoanCalc Score se presenta como indicador matemático interno.

## Tokens

### Color

| Token | Valor | Uso |
|---|---|---|
| `--lc-navy-950` / `--lc-navy-900` / `--lc-navy-800` | `#041330` / `#061a3a` / `#0c2a5b` | Cabecera, héroes, pie |
| `--lc-blue-800` → `--lc-blue-50` | `#0b3d91` … `#eef4ff` | Acento de marca, estados activos, fondos informativos |
| `--lc-teal-600` / `--lc-teal-500` | `#0d9488` / `#14b8a6` | Escenarios con abonos |
| `--lc-text` / `--lc-text-muted` / `--lc-text-subtle` | `#0f172a` / `#475569` / `#64748b` | Texto principal, secundario y auxiliar (todos ≥ 4.5:1 sobre blanco) |
| `--lc-page-bg` / `--lc-surface` / `--lc-surface-muted` / `--lc-surface-sunken` | `#f5f7fb` / `#fff` / `#f4f7fb` / `#eef2f7` | Fondo, tarjetas, zonas secundarias |
| `--lc-border` / `--lc-border-strong` | `#d7e0ec` / `#b6c4d6` | Separadores y bordes de controles |
| `--lc-success|danger|warning|info` (+ `-bg`, `-border`) | — | Estados. Siempre acompañados de icono o texto, nunca solo color |
| `--lc-data-principal` / `--lc-data-interest` / `--lc-data-extra` | `#0b5ed7` / `#f59e0b` / `#0d9488` | Gráficos de capital, interés y abonos (con leyenda textual) |

Los alias heredados (`--text`, `--muted`, `--border`, `--surface`, `--soft`, `--page-bg`, `--page-bg-alt`) apuntan a estos tokens y no deben usarse en código nuevo.

### Tipografía

Pila del sistema (`--lc-font`), sin fuentes externas. Escala fluida con `clamp()`:

| Token | Rango | Uso |
|---|---|---|
| `--lc-text-xs` / `-sm` | 13 / 14 px | Etiquetas, notas |
| `--lc-text-base` / `-lg` | 16 / 18 px | Texto corrido |
| `--lc-text-xl` | 20 → 24 px | Títulos de tarjeta |
| `--lc-text-2xl` | 24 → 32 px | Títulos de sección |
| `--lc-text-3xl` | 30 → 44 px | Título de página |
| `--lc-text-display` | 34 → 56 px | Cifra protagonista (cuota) y héroe de portada |

Las cifras usan `.lc-num` (`font-variant-numeric: tabular-nums`) para que las columnas sean comparables.

### Espaciado, radios y elevación

- **Espaciado:** múltiplos de 4 px (`--lc-space-1` = 4 px … `--lc-space-16` = 64 px). `--lc-card-gap` = **24 px** entre tarjetas independientes en todas las anchuras; `--lc-card-pad` fluido 18 → 28 px; `--lc-section-gap` 48 → 96 px.
- **Radios:** `--lc-radius-xs` 6 · `-sm` 10 · `-md` 12 (botones, campos) · `--lc-radius` 14 · `-lg` 18 (tarjetas) · `-xl` 24 (héroes) · `-pill`.
- **Elevación:** `--lc-shadow-xs` (tarjetas en reposo) · `-sm` · `-md` (elementos destacados) · `--lc-shadow` (solo héroes).
- **Contenedor:** `.container` = 1180 px de contenido + margen lateral `--lc-gutter` (16 px móvil, 24 px desde 768 px).

### Movimiento

`--lc-duration` 160 ms con `--lc-ease`. Solo color, borde y sombra de elementos interactivos. Con `prefers-reduced-motion: reduce` todo se desactiva. No hay `scroll-behavior: smooth` global: interrumpía el desplazamiento al inicio del router (hallazgo H1 de la auditoría).

## Componentes

### Botones (Bootstrap tematizado)

| Clase | Rol | Ejemplo |
|---|---|---|
| `.btn-primary` | Una acción principal por bloque | «Calcular préstamo», «PDF» |
| `.btn-outline-primary` | Secundaria con acento | «Excel», «Ver la guía» |
| `.btn-outline-secondary` | Secundaria neutra | «Volver», «Nueva simulación», «Limpiar» |
| `.btn-danger` / `.btn-outline-danger` | Solo acciones destructivas | «Cerrar todas las sesiones», «Limpiar historial» |
| `.btn-light` / `.btn-outline-light` | Sobre superficies oscuras | CTA de portada |

Todos miden al menos 44 px de alto (`.btn-sm` 40 px con puntero fino y 44 px en pantallas táctiles); `.btn-lg` 52 px. Icono + texto separados por `gap`; los iconos llevan `aria-hidden="true"`.

### Formularios

`.form-control` / `.form-select` de 48 px, borde `--lc-border-strong`, foco con borde azul y halo suave. Errores con `.is-invalid` + `.invalid-feedback` (texto, no solo color) y `aria-invalid` / `aria-describedby` en el campo.

### Primitivas globales

| Clase | Descripción |
|---|---|
| `.lc-card` | Superficie blanca, borde, radio `lg`, padding fluido |
| `.lc-eyebrow` | Rótulo superior de sección en mayúsculas |
| `.lc-num` | Cifras tabulares sin salto de línea |
| `.lc-alert` (`--danger`, `--success`, `--info`, `--warning`) | Mensajes con icono |
| `.lc-spinner` | Carga dentro de un botón |
| `.lc-required` | Marca de campo obligatorio |
| `.lc-on-dark` | Cambia el indicador de foco a amarillo sobre fondos navy |
| `.no-print` | Oculta el elemento al imprimir |

Todo lo demás es específico de cada pantalla y vive en su componente.

## Accesibilidad

- **Foco visible:** contorno de 3 px `--lc-focus` (azul sobre claro; amarillo `--lc-focus-on-dark` dentro de `.lc-on-dark`).
- **Cambio de ruta:** `RouteFocus` (`core/a11y/route-focus.ts`) lleva la vista arriba de forma instantánea y enfoca el `h1` de la nueva página. No actúa en la carga inicial, con fragmentos (`#seccion`) ni al cambiar solo la consulta.
- **Objetivos táctiles:** ≥ 44 × 44 px.
- **Color:** nunca es la única señal (iconos, texto o patrones en gráficos y estados).
- **Controles nativos:** `<button>`, `<a>`, `<input type="radio">`, `<table>`; ARIA solo cuando HTML no basta.

## Impresión

`@media print` global oculta `.skip-link` y `.no-print` y fuerza fondo blanco; cada pantalla conserva sus reglas de impresión.
