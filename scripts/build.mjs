// Construit le site statique dans dist/ : code assemblé, données, icônes, service worker.
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const OUT = 'dist';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

await esbuild.build({
  entryPoints: { app: 'src/main.js' },
  bundle: true,
  format: 'esm',
  splitting: true,
  outdir: OUT,
  chunkNames: 'js/[name]-[hash]',
  minify: true,
  target: ['safari15', 'chrome100'],
  loader: { '.png': 'dataurl', '.svg': 'dataurl' },
  external: ['html2canvas', 'dompurify', 'canvg', 'icons/*'],
  legalComments: 'none',
  logLevel: 'warning',
});

cpSync('public', OUT, { recursive: true });

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(OUT).filter((f) => !f.endsWith('sw.js') && !f.endsWith('.map') && !f.includes('.nojekyll'));
const hash = createHash('sha256');
for (const f of files.sort()) hash.update(f).update(readFileSync(f));
const VERSION = `${new Date().toISOString().slice(0, 10)}-${hash.digest('hex').slice(0, 8)}`;

for (const f of ['index.html', 'app.js']) {
  const p = join(OUT, f);
  writeFileSync(p, readFileSync(p, 'utf8').replaceAll('__VERSION__', VERSION));
}
const precache = ['./', ...files.map((f) => './' + relative(OUT, f).split('\\').join('/'))];
const sw = readFileSync('scripts/sw.template.js', 'utf8').replace('__VERSION__', VERSION).replace('__PRECACHE__', JSON.stringify(precache));
writeFileSync(join(OUT, 'sw.js'), sw);
writeFileSync(join(OUT, '.nojekyll'), '');

// Copie publiée par GitHub Pages (dossier docs/ du dépôt)
rmSync('docs', { recursive: true, force: true });
cpSync(OUT, 'docs', { recursive: true });

const size = files.reduce((s, f) => s + statSync(f).size, 0);
console.log(`Version ${VERSION} : ${files.length} fichiers, ${(size / 1024).toFixed(0)} Ko`);
