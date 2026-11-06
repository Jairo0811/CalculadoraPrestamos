# LoanCalc RD — Integración Google AdSense + Cloudflare Pages

**Dominio público:** https://loancalcrd.pages.dev  
**Plataforma:** Angular 21 estático, Cloudflare Pages con GitHub → `master`.  
**Estado:** infraestructura preparada; la cuenta AdSense del propietario existe, pero la aprobación de este sitio se debe verificar en el panel AdSense.

## 1. Añadir el sitio en Google AdSense

1. Entra a https://adsense.google.com/ → **Sitios** → **Nuevo sitio**.
2. Registra **loancalcrd.pages.dev** (dominio real; no Netlify).
3. Comprueba que el sitio queda «Requiere revisión» o «Listo». Una cuenta aprobada no significa que todos sus sitios estén aprobados.
4. En AdSense, localiza tu **ID de editor**, por ejemplo `pub-1234567890123456` (este número es ilustrativo; **nunca** debes usarlo).
5. Selecciona verificación mediante **metaetiqueta** o **ads.txt**. Ambos se generan automáticamente durante el build cuando se configura tu ID.
6. Solicita la revisión del sitio. La decisión y el calendario dependen exclusivamente de Google.

## 2. Configurar ID de editor en Cloudflare Pages

En Cloudflare Dashboard → **Workers & Pages** → proyecto **loancalcrd** → **Settings** → **Variables and Secrets**, agrega a **Production**:

| Variable | Valor | Función |
|---|---|---|
| `ADSENSE_PUBLISHER_ID` | `pub-XXXXXXXXXXXXXXXX` | Tu ID real, 16 dígitos |
| `ADSENSE_AUTO_ADS_ENABLED` | **sin definir** o `0` | Mantener anuncios desactivados mientras el sitio está en revisión |
| `ADSENSE_SITE_APPROVED` | **sin definir** o `0` | Se habilita solo cuando el estado del sitio sea «Listo» |
| `ADSENSE_CMP_READY` | **sin definir** o `0` | Se habilita tras configurar consentimiento adecuado, incl. CMP certificada donde aplique |

El ID de editor es **público**, no una contraseña. No agregues credenciales de AdSense, contraseñas bancarias o claves JWT al build de Angular.

Guarda las variables, realiza un nuevo despliegue de `master` y verifica el resultado en Cloudflare. El comando debe seguir siendo:

```text
Root directory: calculadora-prestamos
Build command: npm ci && npm run build
Build output: dist/calculadora-prestamos/browser
Node.js: 22
```

El build `npm run build` ejecuta Angular, `write-build-info.mjs` y `configure-adsense.mjs`.

## 3. Archivos que se generan automáticamente

Con un ID válido:

- El HTML de producción incluye `<meta name="google-adsense-account" content="ca-pub-...">` en el `<head>` para la comprobación de propiedad.
- Se crea el archivo `/ads.txt` en el directorio de salida con la línea:
  ```text
  google.com, pub-TU_ID_REAL, DIRECT, f08c47fec0942fa0
  ```
- El script recorre cada `index.html` prerenderizado para evitar páginas con metadata desactualizada.
- Sin ID no se genera archivo `ads.txt` ni la metaetiqueta.
- El código de anuncios **no se carga** de manera predeterminada.

Verifica después del despliegue:

- `https://loancalcrd.pages.dev/` → Ver código fuente → `google-adsense-account`.
- `https://loancalcrd.pages.dev/ads.txt` → respuesta 200, texto de tu editor.
- `https://loancalcrd.pages.dev/privacy` y `/about` → accesibles.
- `https://loancalcrd.pages.dev/robots.txt` y `/sitemap.xml` → accesibles.

**Importante:** el proveedor y el rastreador de Google son quienes confirman los estados de verificación y de ads.txt. Un archivo accesible no garantiza aprobación.

## 4. Activación de anuncios (únicamente después de aprobar el sitio)

No habilites Auto Ads antes de cumplir **todas** estas condiciones:

1. En AdSense → **Sitios**, el dominio aparece como **«Listo»**.
2. En AdSense → **Anuncios**, se ha configurado el formato Auto Ads correspondiente.
3. Política de privacidad y preferencias de anuncios revisadas.
4. CMP certificada y compatible con IAB TCF cuando se requiere (EEE, Reino Unido y Suiza); consentimiento para cookies/identificadores conforme a normativa.
5. Decisión consciente sobre qué páginas excluir: nunca colocar anuncios de forma que parezcan botones o resultados financieros.

Solo cuando todo esté verificado, configura en producción:

```text
ADSENSE_AUTO_ADS_ENABLED=1
ADSENSE_SITE_APPROVED=1
ADSENSE_CMP_READY=1
```

Esto agrega el script asíncrono oficial de Google al `<head>` del HTML estático. Las vistas previas de Cloudflare Pages quedan sin script de anuncios.

**Estos valores son controles de publicación manuales, no sustituyen la revisión de Google ni una CMP real**. No fijar los valores en `1` solo para superar pruebas.

## 5. UX y seguridad

- La calculadora pública continúa sin registro.
- Las cuentas siguen desactivadas en Cloudflare hasta Fase 8.
- No coloques anuncios en el formulario de datos, botones de cálculo o exportaciones que puedan inducir clics accidentales.
- No invites ni incentives clics en anuncios; nunca hagas clic en tus propios anuncios.
- Si se requiere un banner de consentimiento, configúralo a través de una CMP certificada, no mediante un modal casero no integrado con AdSense.
- En producción, comprueba la consola y la respuesta de Google para ver si efectivamente se están mostrando anuncios. Un script cargado no garantiza impresiones ni ingresos.

## 6. Pruebas

```powershell
cd calculadora-prestamos
npm ci
npm run test:adsense
npm run test:ci
npm run build
```

CI comprueba los límites de seguridad, el formato de `ads.txt`, el HTML de verificación y las páginas legales. El despliegue a producción lo realiza Cloudflare Pages desde `master`.

## Fuentes oficiales

- https://support.google.com/adsense/answer/12131223
- https://support.google.com/adsense/answer/12169212
- https://support.google.com/adsense/answer/1348695
- https://support.google.com/adsense/answer/13554116
- https://support.google.com/adsense/answer/9274019
