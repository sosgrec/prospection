// Petit serveur statique local pour tester dist/.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
const ROOT = process.argv[2] || 'dist';
const PORT = +(process.argv[3] || 8765);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = normalize(join(ROOT, p));
    if (!f.startsWith(normalize(ROOT))) throw new Error('hors racine');
    await stat(f);
    res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(f));
  } catch {
    res.writeHead(404);
    res.end('404');
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
