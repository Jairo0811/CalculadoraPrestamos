// Escribe build-info.json en la salida del build para poder verificar QUÉ commit está
// publicado en cada despliegue (producción o Deploy Preview) sin acceder al panel de Cloudflare Pages.
// Solo contiene metadatos públicos del repositorio; nunca secretos ni variables privadas.
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const outputDir = join(process.cwd(), 'dist', 'calculadora-prestamos', 'browser');
if (!existsSync(join(outputDir, 'index.html'))) {
  console.error(`No se encontró el build en ${outputDir}. Ejecuta "npm run build" antes.`);
  process.exit(1);
}

const info = {
  app: 'loancalc-rd',
  commit: process.env.CF_PAGES_COMMIT_SHA ?? process.env.COMMIT_REF ?? process.env.GITHUB_SHA ?? 'local',
  context: (process.env.CF_PAGES === '1' ? 'cloudflare-pages' : process.env.CONTEXT ?? 'local'),
  branch: process.env.CF_PAGES_BRANCH ?? process.env.HEAD ?? process.env.BRANCH ?? null,
  reviewId: process.env.REVIEW_ID ?? null,
  builtAt: new Date().toISOString()
};

writeFileSync(join(outputDir, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
console.log('build-info.json', info);
