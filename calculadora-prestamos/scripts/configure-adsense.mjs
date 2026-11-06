/**
 * AdSense integration for the Cloudflare Pages static Angular build.
 *
 * Verification (meta + ads.txt) requires only a real publisher ID.
 * Auto Ads require explicit site approval, certified CMP setup and an opt-in;
 * previews never load ads. Publisher IDs are public identifiers, not secrets.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLISHER_PATTERN = /^pub-\d{16}$/;
export const GOOGLE_SELLER_ID = 'f08c47fec0942fa0';
// Real public publisher ID explicitly supplied by the project owner.
export const PUBLISHER_ID = 'pub-1228497984086853';

export function normalizePublisherId(raw = '') {
  const id = raw.trim().replace(/^ca-/, '');
  if (!id) return '';
  if (!PUBLISHER_PATTERN.test(id)) {
    throw new Error('ADSENSE_PUBLISHER_ID debe tener la forma pub- seguida de 16 dígitos.');
  }
  return id;
}

export function adsTxtFor(id) {
  const publisher = normalizePublisherId(id);
  return publisher ? `google.com, ${publisher}, DIRECT, ${GOOGLE_SELLER_ID}\n` : null;
}

export function canEnableAutoAds(env = {}) {
  const requested = env.ADSENSE_AUTO_ADS_ENABLED === '1';
  if (!requested) return false;
  if (env.ADSENSE_SITE_APPROVED !== '1' || env.ADSENSE_CMP_READY !== '1') {
    throw new Error('Auto Ads requiere ADSENSE_SITE_APPROVED=1 y ADSENSE_CMP_READY=1.');
  }
  // Never expose real advertisements on Cloudflare Pages preview deployments.
  if (env.CF_PAGES === '1' && env.CF_PAGES_BRANCH !== 'master') return false;
  return true;
}

export function configureHtml(html, rawPublisherId, enableAds = false) {
  const id = normalizePublisherId(rawPublisherId);
  if (enableAds && !id) throw new Error('No se puede habilitar AdSense sin publisher ID.');
  if (!id) return html;
  if (!html.includes('</head>')) throw new Error('HTML compilado sin etiqueta </head>.');
  if (html.includes('name="google-adsense-account"')) throw new Error('La etiqueta AdSense ya existe: evita inyecciones duplicadas.');
  const verification = `  <meta name="google-adsense-account" content="ca-${id}">\n`;
  const script = enableAds
    ? `  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-${id}" crossorigin="anonymous"></script>\n`
    : '';
  return html.replace('</head>', verification + script + '</head>');
}

function htmlFiles(root) {
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...htmlFiles(path));
    else if (entry.isFile() && entry.name === 'index.html') result.push(path);
  }
  return result;
}

export function applyAdsenseBuild(output, env = process.env) {
  if (!existsSync(join(output, 'index.html'))) throw new Error('Primero compila Angular con ng build.');
  // Public AdSense publisher ID is versioned, so Cloudflare requires no manual secret setup.
  // An optional dashboard variable must match the site's owner to prevent mixed accounts.
  const id = normalizePublisherId(env.ADSENSE_PUBLISHER_ID ?? PUBLISHER_ID);
  if (id !== PUBLISHER_ID) throw new Error('ADSENSE_PUBLISHER_ID no coincide con el editor autorizado para LoanCalc RD.');
  const autoAds = canEnableAutoAds(env);
  if (autoAds && !id) throw new Error('Falta ADSENSE_PUBLISHER_ID.');
  const pages = htmlFiles(output);
  if (id) {
    for (const path of pages) {
      const original = readFileSync(path, 'utf8');
      writeFileSync(path, configureHtml(original, id, autoAds));
    }
    writeFileSync(join(output, 'ads.txt'), adsTxtFor(id));
  }
  return { verificationConfigured: !!id, autoAdsEnabled: autoAds, htmlPages: pages.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const target = join(process.cwd(), 'dist', 'calculadora-prestamos', 'browser');
  const state = applyAdsenseBuild(target);
  console.log('AdSense build:', state);
  console.log('La verificación está lista; los anuncios siguen desactivados mientras este sitio no tenga aprobación de AdSense.');
}
