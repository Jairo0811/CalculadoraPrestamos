// Sirve el build de producción con el mismo fallback SPA que Cloudflare Pages y ejecuta e2e/smoke.spec.ts.
// Uso: npm run build && npm run e2e:smoke
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(process.cwd(), 'dist', 'calculadora-prestamos', 'browser');
const port = Number(process.env.SMOKE_PORT ?? 4400);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
  '.woff': 'font/woff', '.woff2': 'font/woff2'
};

const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  const candidate = normalize(join(root, pathname));
  let file = candidate.startsWith(root) ? candidate : join(root, 'index.html');
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    await stat(file);
  } catch {
    file = join(root, 'index.html'); // Fallback SPA, igual que public/_redirects.
  }
  try {
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(500).end();
  }
});

server.listen(port, () => {
  const child = spawn('npx', ['playwright', 'test', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, E2E_BASE_URL: `http://localhost:${port}` }
  });
  child.on('exit', code => server.close(() => process.exit(code ?? 1)));
});
