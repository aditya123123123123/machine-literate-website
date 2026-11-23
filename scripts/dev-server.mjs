// Local preview server. Serves public/ the way Vercel does (clean URLs) and
// routes /api/* to the real handlers in api/. Outside production the waitlist
// API runs in dry-run mode, so nothing is written to the database.
//
//   npm run dev            -> http://localhost:3000
//   PORT=4000 npm run dev
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const pub = join(root, 'public');
const port = Number(process.env.PORT || 3000);
// This server is exclusively a local preview, even with production env inherited.
process.env.VERCEL_ENV = 'development';
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

async function file(path) {
  try { const s = await stat(path); return s.isFile() ? path : null; } catch { return null; }
}

createServer(async (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const url = new URL(req.url, 'http://localhost');
  // Vercel serves the real tracker; local previews must not collect analytics.
  if (url.pathname === '/_vercel/insights/script.js') {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    return res.end('// Web Analytics is disabled in local previews.\n');
  }
  if (url.pathname === '/robots.txt') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('User-agent: *\nDisallow: /\n');
  }
  if (url.pathname.startsWith('/api/')) {
    if (!['/api/waitlist', '/api/volunteer'].includes(url.pathname)) { res.statusCode = 404; return res.end('Not found'); }
    const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, '');
    try {
      const mod = await import(join(root, 'api', `${name}.js`));
      return mod.default(req, res);
    } catch {
      res.statusCode = 404; return res.end('Not found');
    }
  }
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (rel.split(/[/\\]/).includes('..')) { res.statusCode = 400; return res.end(); }
  const base = join(pub, rel);
  const hit = (await file(base)) || (await file(base + '.html')) || (await file(join(base, 'index.html')));
  if (!hit) { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain'); return res.end('Not found'); }
  res.setHeader('Content-Type', types[extname(hit)] || 'application/octet-stream');
  res.end(await readFile(hit));
}).listen(port, '127.0.0.1', () => console.log(`Machine Literate running at http://localhost:${port}`));
