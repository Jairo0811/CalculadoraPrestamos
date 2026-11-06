# Historial de cambios

Todos los cambios importantes de LoanCalc RD se documentarán en este archivo.

El proyecto sigue un esquema de versionado semántico.

## [Unreleased] — páginas legales y contacto

- Política de Privacidad ampliada para aclarar datos opcionales e historial almacenado en el navegador.
- Términos de Uso y página de Contacto públicas, accesibles y enlazadas desde el pie de página.
- Sitemap actualizado y prueba E2E/a11y para privacidad, términos, contacto y acerca del proyecto.
- Contacto mediante GitHub Issues con advertencia explícita sobre la naturaleza pública del canal; sin simular un formulario privado.

---

## [Unreleased] — integración opcional Google AdSense

- Infraestructura de verificación en Cloudflare Pages: metaetiqueta de editor y `ads.txt` generados desde variables de entorno.
- Activación de Auto Ads deshabilitada por defecto, con controles explícitos para aprobación y consentimiento; previews sin anuncios.
- Páginas públicas de privacidad y acerca del proyecto, enlaces visibles en pie de página, robots.txt y sitemap.xml.
- Tests automáticos para el formato del ID, los archivos generados y las condiciones de activación.

---

## [Unreleased] — v3, Fase 7 (Plataforma financiera personal)

> Fase 7 integrada en `master` mediante PR #59, commit `348659b7`. El frontend público sigue siendo anónimo; las cuentas se habilitarán en Fase 8.

### Añadido
- Dashboard privado de simulaciones con indicadores descriptivos, filtros, búsqueda y ordenación.
- Vista de préstamos guardados con favoritos, cambio de nombre, eliminación y recuperación de resultados.
- Comparación visual de dos simulaciones guardadas, con cuotas, intereses, totales y plazos.
- Guardado explícito desde la pantalla de resultados y migración voluntaria del historial local sin enviar datos personales.
- Rutas protegidas por autenticación y desactivadas por el feature flag de producción.
- Pruebas unitarias y E2E de las acciones privadas y controles de privacidad.

---

## [Unreleased] — v3, Fase 6 (Cuentas, seguridad y renovación UX/UI)

> Fase 6 integrada en `master` (PR #57).

> No publicado. La versión estable sigue siendo 2.1.0.

### Seguridad

- Sin enumeración de usuarios en registro, reenvío y recuperación: la contraseña se valida antes de consultar el correo, las respuestas son idénticas y los correos se envían desde una cola en segundo plano.
- Tiempo de login igualado para correos inexistentes; el estado "cuenta sin confirmar" solo se revela con la contraseña correcta.
- CSRF reforzado: además del encabezado `X-LoanCalc-CSRF` se valida `Origin`/`Referer` contra los orígenes permitidos.
- `SameSite` de la cookie de refresh configurable (`None` fuerza `Secure`) y guía de topología de mismo origen.
- Límite de 10 sesiones activas por usuario y limpieza periódica de sesiones expiradas o revocadas.
- JWT restringido a HS256; claves de Data Protection persistentes mediante `DataProtection:KeysPath`.
- Rate limiting configurable por política (login, registro, verificación, recuperación, sesión y API) con `Retry-After`.
- Encabezados de seguridad y HSTS en la API; encabezados de seguridad en Netlify.
- Dependencias de producción del frontend sin vulnerabilidades conocidas (Angular 21.2.26, express y transitivas actualizadas).

### Añadido

- `POST /api/v1/auth/change-password` (revoca todas las sesiones y emite una nueva).
- Avisos por correo de "cuenta existente" y "contraseña cambiada".
- Health checks `/health/live` y `/health` (con PostgreSQL).
- Frontend: `authInterceptor` (Bearer solo hacia la API, renovación única y reintento único), `authGuard`, `accountsEnabledGuard`, configuración por entorno (`APP_CONFIG`), recuperación de sesión al recargar y serialización de renovaciones entre pestañas (Web Locks).
- Pantallas de cuenta rediseñadas (inicio de sesión, registro, confirmación, recuperación, restablecimiento) y área privada "Seguridad de la cuenta".
- Cabecera de navegación global y enlace "Saltar al contenido".
- Home: explicación del método francés, abonos, LoanCalc Score, comparación y diferencias entre uso con y sin cuenta.
- Pruebas: 85 unitarias/componentes (antes 22), E2E con Playwright + axe-core, y 48 pruebas de backend contra PostgreSQL (antes 10).

### Cambiado

- `Program.cs` dividido en módulos de endpoints y extensiones sin cambiar las rutas `/api/v1`.
- Errores en Problem Details con códigos estables (`code`) y mensajes en español; JSON malformado devuelve 400 en todos los entornos.
- Los enlaces de correo ya no incluyen el correo electrónico; `reset-password` usa `userId`.
- Validaciones de dominio: tipo de préstamo válido, monto ≤ RD$ 1,000,000,000, tasa 0–100 %, plazo 1–600 meses, nombre ≤ 120 caracteres.
- Calculadora: nombre, fecha de nacimiento y cédula pasan a ser **opcionales**; validación por campo, plazos rápidos y campos numéricos vacíos por defecto.
- Formato monetario único `RD$ 1,234.56` en pantalla, PDF y Excel.
- LoanCalc Score con colores accesibles; aviso explícito de que las recomendaciones no son asesoría financiera.
- Página de resultados cargada de forma diferida (bundle inicial de 1.37 MB a 0.83 MB).
- Logo optimizado en WebP (de 900 KB a 22 KB).

### Corregido

- Mención a un "tema oscuro" inexistente en la Home y la documentación.
- Contraste insuficiente de textos secundarios de la Home (WCAG AA).

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
- Visualización en tema oscuro (retirado posteriormente: la interfaz es exclusivamente clara).
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