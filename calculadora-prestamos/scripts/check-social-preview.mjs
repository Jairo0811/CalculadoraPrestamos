// Comprueba metadatos Open Graph en el HTML estático compilado por Angular.
// WhatsApp extrae estas etiquetas sin ejecutar JavaScript.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const output = join(process.cwd(), 'dist', 'calculadora-prestamos', 'browser');
const htmlFile = join(output, 'index.html');
const publicImage = join(output, 'assets', 'img', 'logo-loancalc-rd-900.webp');

assert.ok(existsSync(htmlFile), 'Falta index.html en el build de Angular');
assert.ok(existsSync(publicImage), 'Falta el logotipo referenciado por og:image');

const html = readFileSync(htmlFile, 'utf8');
function meta(attribute, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp('<meta\\s+[^>]*' + attribute + '="' + escaped + '"[^>]*content="([^"]+)"', 'i');
  const match = html.match(pattern);
  assert.ok(match, `Falta el metadato ${name} en el HTML estático`);
  return match[1];
}

assert.ok(meta('property', 'og:title').includes('LoanCalc RD'));
assert.ok(meta('property', 'og:description').length >= 40);
assert.equal(meta('property', 'og:type'), 'website');
assert.equal(meta('property', 'og:url'), 'https://loancalcrd.netlify.app/');
const image = meta('property', 'og:image');
assert.equal(image, 'https://loancalcrd.netlify.app/assets/img/logo-loancalc-rd-900.webp');
assert.equal(meta('property', 'og:image:type'), 'image/webp');
assert.equal(meta('name', 'twitter:card'), 'summary_large_image');
assert.ok(html.includes('<link rel="canonical" href="https://loancalcrd.netlify.app/">'));
assert.ok(statSync(publicImage).size < 600_000, 'La imagen supera 600 KB');

const bytes = readFileSync(publicImage);
assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', 'La imagen debe ser un WebP válido');
assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', 'La imagen debe ser un WebP válido');

console.log('Vista previa social: Open Graph, Twitter Card e imagen pública validados.');
