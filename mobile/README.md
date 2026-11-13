# LoanCalcRD Mobile · M0 (prototipo Angular Native)

Proyecto experimental **independiente** del frontend en Cloudflare, basado en
[ng-native](https://ng-native.com/guide/getting-started), Angular 22 y Expo 58.
No utiliza WebView: representa `view`, `text`, `pressable` y `text-input` como componentes nativos.

## Qué hay en M0
- Formulario nativo de monto RD$, interés anual (incluye 0 %) y plazo en meses.
- Cuota francesa, intereses, total y primeras 6 filas de amortización.
- Validaciones y pruebas de cálculo; sin API ni conexión, publicidad o datos personales.
- Lógica financiera pura replicada provisionalmente del motor web: **aún no es una biblioteca compartida**.

## Primer inicio en Windows PowerShell
Desde `CalculadoraPrestamos/calculadora-prestamos`:
```powershell
cd ..\mobile
npm install
npm run typecheck
npm test
npm start
```
Abre Expo Go en Android y escanea el QR. O pulsa `a` si tienes emulador Android Studio.
Si el móvil no puede conectar con Metro en la misma red, prueba `npx expo start --tunnel`.

**Es una alpha.** Los comandos no garantizan una app estable en todo dispositivo.
`npm run export` genera un bundle Expo Android, **no un APK**.
`mobile/` posee dependencias separadas: el Angular web y Cloudflare no cambian.
La creación inicial de `package-lock.json` ocurre con `npm install`; versionarlo antes de un release.

## Siguientes fases
M1: extraer motor compartido y cubrir regresiones de precisión; M2: historial local y tabla;
M3: Android test real y publicación beta; M4: sincronización al disponer de API v3.
No se activa AdMob ni autenticación en este prototipo.

Docs: https://ng-native.com/guide/getting-started · https://ng-native.com/guide/limitations
