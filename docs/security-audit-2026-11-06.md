# Auditoría de dependencias — LoanCalc RD
**Fecha de corte:** 6 de noviembre de 2026 (UTC)  
**Fuente:** `npm audit --package-lock-only --json` ejecutado en GitHub Actions, [inventario](https://github.com/Jairo0811/CalculadoraPrestamos/actions/workflows/security-audit.yml).

## Alcance

| Código | Publicación | Alcance de auditoría | Hallazgos |
| --- | --- | --- | --- |
| `calculadora-prestamos/` (Angular 21) | Sí, calculadora pública en Cloudflare Pages | Dependencias npm de producción | **0** |
| `calculadora-prestamos/` (Angular 21) | Herramientas de build y desarrollo | Árbol npm completo, incluido `devDependencies` | **16 moderados; 0 altos, 0 críticos** |
| Angular 9 histórico (**retirado del árbol activo**) | **Nunca desplegado en la versión actual** | Auditoría histórica de `legacy/package.json`, antes de su eliminación, mediante resolución temporal con `--ignore-scripts --legacy-peer-deps` | **141** (5 críticos, 50 altos, 72 moderados y 14 bajos) |
| `backend/` (.NET 10) | Preparado para fase futura | CI de NuGet con `--vulnerable --include-transitive`, falla en altos y críticos | El último CI superó su control; no equivale a declarar 0 vulnerabilidades |

**Importante:** el contador de alertas GitHub Dependabot **no es equivalente** a `npm audit`. Las cifras pueden variar según base de datos, lockfile, fecha y algoritmo de agrupación.

## Hallazgos y riesgo

- Las **16 alertas moderadas** del árbol activo dependen principalmente de herramientas transitivas de `@angular/cli` (como `glob` y `minimatch`). El informe automático sugiere Angular CLI 22 como corrección global, lo cual es una actualización mayor. No se aplica `npm audit fix --force` ni overrides de transitorios sin prueba de compatibilidad.
- Antes de retirarla, la carpeta `legacy/` contenía Angular 9, Bootstrap 4, Karma y Protractor. Su auditoría detectó alertas graves en `form-data`, `loader-utils`, `request` y `websocket-driver`. **Estos hallazgos se conservan únicamente como evidencia histórica; no forman parte del árbol actual.**
- La implementación Angular 9 fue retirada del árbol activo para reducir deuda técnica y ruido en el análisis de dependencias. **Sigue recuperable desde el historial de Git**, sin reescribirlo. Si se decide reactivarla, será necesaria una migración integral y una nueva auditoría.

## Medidas de control

1. El CI del frontend rechaza vulnerabilidades npm de producción **moderadas, altas o críticas** con `npm audit --omit=dev --audit-level=moderate`.
2. Auditoría semanal **solo del árbol npm activo**, con informes JSON disponibles en GitHub Actions. La auditoría de Angular 9 se conserva como resultado histórico, sin tareas nuevas de instalación ni escaneo sobre una carpeta eliminada.
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

El sistema Angular 9 ya no está en `master`. Para consultar su implementación, utilizar el historial de Git anterior a la eliminación. No ejecutar el proyecto histórico en producción; la auditoría de noviembre de 2026 queda documentada en esta página.

**Este informe refleja una fecha de corte y no es una certificación de ausencia de vulnerabilidades.**
