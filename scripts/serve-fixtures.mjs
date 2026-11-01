// Minimal static server for tests/fixtures (used by Playwright). No dependencies.
//   node scripts/serve-fixtures.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '../tests/fixtures');
const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = normalize(join(root, relative));
  if (!file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Fixtures on http://127.0.0.1:${port}`));
