# LoanCalc RD — Auditoría de preparación para Google AdSense
**Fecha:** 6 de noviembre de 2026

## Evidencia del repositorio
- `master` cuenta con CI Angular, auditoría npm, Playwright E2E y verificación de Cloudflare.
- Existen páginas públicas de Inicio, Calculadora, Acerca del proyecto, Contacto, Privacidad y Términos; este PR añade una guía financiera original y accesible.
- `robots.txt` permite el rastreo y el `sitemap.xml` enumera las rutas públicas.
- El build inserta la etiqueta `google-adsense-account` y genera `ads.txt` con el ID del editor autorizado.
- La publicidad automática sigue desactivada a la espera de aprobación, políticas y consentimiento aplicable.
- Los datos de simulaciones se almacenan localmente en la versión pública; las funciones privadas continúan deshabilitadas.
- El comparador usa tasas precargadas ilustrativas, no precios bancarios en tiempo real; este PR añade una explicación visible y sustituye «Mejor opción» por «Menor total simulado».

## Pendientes que deben comprobarse fuera del repositorio
1. **AdSense → Sitios:** comprobar si `loancalcrd.pages.dev` figura como pendiente de revisión, requiere revisión o listo. No se puede deducir este estado del build.
2. **AdSense → Privacidad y mensajes:** configurar una plataforma CMP certificada para EEE, Reino Unido y Suiza si se sirve publicidad a visitantes de esas regiones, según las políticas pertinentes.
3. **Navegador público:** comprobar `/ads.txt`, `/robots.txt`, `/sitemap.xml`, rutas legales, guía y la carga sin errores. El acceso directo al sitio no estuvo disponible en la herramienta web durante la auditoría; la verificación de Cloudflare CI es evidencia complementaria, no sustituto de la revisión manual.
4. **Search Console (si se utiliza):** inspeccionar renderizado, canonicals e indexación de las páginas públicas. Aunque hay configuración `app.routes.server.ts` para prerender, el build actual sigue produciendo un solo `index.html` para el sitio público; evaluar SEO por ruta/SSG en un PR aparte, verificando la compatibilidad de Cloudflare y las rutas protegidas.
5. **Contenido y usabilidad:** probar en móvil, escritorio y navegador sin extensiones; verificar que enlaces legales y ejemplos no sean confusos.
6. **Aprobación:** Google decide si el sitio cumple. La existencia de la etiqueta de verificación o un dominio incluido en la Public Suffix List no garantiza aprobación.

## Dominio
`pages.dev` figura en la Public Suffix List. Google AdSense permite registrar subdominios de determinadas plataformas incluidas en esa lista; por ello puede intentarse registrar `loancalcrd.pages.dev` sin comprar un dominio propio, sujeto al resultado real de la revisión.

## Referencias oficiales
- https://support.google.com/adsense/answer/12170421
- https://support.google.com/adsense/answer/7299563
- https://support.google.com/adsense/answer/12176698
- https://support.google.com/adsense/answer/1348695
- https://support.google.com/adsense/answer/13554116
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- https://publicsuffix.org/list/public_suffix_list.dat
