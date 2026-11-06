# Optimización de exportaciones PDF — LoanCalc RD

## Problema original

La ruta `/results` cargaba estáticamente `jspdf`, `jspdf-autotable` y `qrcode`, aunque el usuario no solicitara una exportación PDF. El build de Angular 22 del 6/11/2026 mostraba:

- `results`: **545.92 kB** JavaScript bruto (143.90 kB transferencia estimada), cargado al abrir los resultados.
- Chunks independientes para `html2canvas` (**201.15 kB**), y otros módulos opcionales de jsPDF que LoanCalc RD no usa directamente.
- Advertencias CommonJS por `qrcode` y los paquetes transitivos de `canvg` (core-js, raf, rgbcolor) y `html2canvas`.

## Cambios aplicados

1. Las dos exportaciones PDF (`LoanCalcRD-*.pdf` y `LoanCalcRD-Abonos-*.pdf`) cargan `jspdf` y `jspdf-autotable` mediante `import()` cuando se solicitan. La calculadora, la visualización de resultados y las exportaciones Excel no los necesitan.
2. Se reemplazó `qrcode` (CommonJS) por `uqr` v0.1.3 (ESM, cero dependencias). Su matriz QR se dibuja en un canvas PNG con margen blanco de 4 módulos y se incrusta en los PDF, como antes. Se elimina `@types/qrcode` y el lockfile se genera sin omitir `peerDependencies`.
3. Se declaran `canvg`, `html2canvas` y `dompurify` como `externalDependencies` del build de Angular, **porque son dependencias opcionales de jsPDF y la aplicación no invoca sus funciones**. No se falsea su implementación ni se ignoran las advertencias mediante `allowedCommonJsDependencies`. Si en el futuro se usa `doc.html()` o renderizado de SVG con jsPDF, **deberá revertirse esa exclusión** y añadirse una prueba funcional.

Referencias: [jsPDF — optional dependencies](https://www.npmjs.com/package/jspdf), [UnJS uqr](https://www.unjs.dev/packages/uqr/), [Angular — CommonJS dependencies](https://angular.dev/tools/cli/build).

## Pruebas de aceptación

- `npm ci` y `npm audit --omit=dev --audit-level=moderate` correctos.
- `npm run test:ci`, `npm run test:adsense`, `npm run build` y validación Open Graph.
- Playwright E2E y `npm run e2e:smoke` completos. El smoke de producción comprueba que el PDF empieza por `%PDF-`, incluye una imagen incrustada (`/Subtype /Image`) y permite descargar el Excel.
- Backend .NET sin cambios; CI aprobado.
- El build de Cloudflare mantiene `ads.txt` y las cuentas deshabilitadas, sin cambios en AdSense.

## Métricas

**Antes** (build de referencia del usuario): `results` 545.92 kB brutos, `html2canvas` 201.15 kB brutos, chunk inicial total 772.78 kB (152.77 kB transferencia estimada).

**Después**: comparar el tamaño de `results` y el total inicial en los logs del build de este PR; no fijar una reducción hasta verificarla. El tamaño del bundle inicial puede mantenerse similar: la optimización prioriza **diferir el coste del PDF hasta hacer clic**.

### Restricciones

Este cambio **no** modifica fórmulas, montos RD$, préstamos, estrategias de abonos, endpoints, privacidad o configuración de anuncios. No introduce dependencias en producción fuera del cliente QR ESM.
