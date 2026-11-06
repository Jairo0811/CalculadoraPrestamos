# Auditoría de dependencias — LoanCalc RD
**Fecha de corte:** 6 de noviembre de 2026 (UTC)  
**Fuente:** `npm audit --package-lock-only --json` ejecutado en GitHub Actions, [inventario](https://github.com/Jairo0811/CalculadoraPrestamos/actions/workflows/security-audit.yml).

## Alcance

| Código | Publicación | Alcance de auditoría | Hallazgos |
| --- | --- | --- | --- |
| `calculadora-prestamos/` (Angular 21) | Sí, calculadora pública en Cloudflare Pages | Dependencias npm de producción | **0** |
| `calculadora-prestamos/` (Angular 21) | Herramientas de build y desarrollo | Árbol npm completo, incluido `devDependencies` | **16 moderados; 0 altos, 0 críticos** |
| `legacy/` (Angular 9) | **No desplegado** | Resolución temporal de `legacy/package.json` con `--ignore-scripts --legacy-peer-deps` y auditoría npm | **141** (5 críticos, 50 altos, 72 moderados y 14 bajos) |
| `backend/` (.NET 10) | Preparado para fase futura | CI de NuGet con `--vulnerable --include-transitive`, falla en altos y críticos | El último CI superó su control; no equivale a declarar 0 vulnerabilidades |

**Importante:** el contador de alertas GitHub Dependabot **no es equivalente** a `npm audit`. Las cifras pueden variar según base de datos, lockfile, fecha y algoritmo de agrupación.

## Hallazgos y riesgo

- Las **16 alertas moderadas** del árbol activo dependen principalmente de herramientas transitivas de `@angular/cli` (como `glob` y `minimatch`). El informe automático sugiere Angular CLI 22 como corrección global, lo cual es una actualización mayor. No se aplica `npm audit fix --force` ni overrides de transitorios sin prueba de compatibilidad.
- El archivo histórico `legacy/` contiene Angular 9, Bootstrap 4, Karma y Protractor. En su árbol aparecen alertas graves relativas a `form-data`, `loader-utils`, `request` y `websocket-driver`; son riesgos para **quien ejecute o compile el proyecto histórico**.
- El código histórico **no debe publicarse** en la aplicación de producción ni utilizarse como servicio o dependencia de nuevas funciones. Está conservado para documentación de la evolución del proyecto. Si se decide reactivar ese sistema, se requiere migración integral y nueva auditoría.

## Medidas de control

1. El CI del frontend rechaza vulnerabilidades npm de producción **moderadas, altas o críticas** con `npm audit --omit=dev --audit-level=moderate`.
2. Auditoría semanal del árbol npm activo, con informes JSON disponibles en GitHub Actions; el informe de Angular 9 se ejecuta bajo demanda.
3. Dependabot propone actualizaciones npm en `calculadora-prestamos/`, NuGet en los proyectos activos y GitHub Actions semanalmente. Cada PR requiere CI y pruebas E2E antes de integrar.
4. No se actualiza Angular de 21 a 22 ni se modifica el lockfile automáticamente en este cambio. Si el riesgo del build requiere mitigación adicional, programar migración Angular completa en PR independiente.
5. Antes de habilitar cuentas y la API pública (fase 8), volver a auditar el Backend, las configuraciones de hosting y los flujos de autenticación.

## Reproducción

```bash
cd calculadora-prestamos
npm ci
npm audit --omit=dev --audit-level=moderate
npm audit --package-lock-only
```

Para el sistema histórico, emplear un entorno aislado. No ejecutar scripts de instalación ni usarlo en producción. La auditoría del snapshot se conserva en el workflow `LoanCalc RD Security Inventory`.

**Este informe refleja una fecha de corte y no es una certificación de ausencia de vulnerabilidades.**
