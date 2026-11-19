// Construit le site statique : code assemblé, données, icônes, service worker.
// node scripts/build.mjs          : la prod, dans dist/, recopiée dans docs/ (publié par GitHub Pages)
// node scripts/build.mjs recette  : la Recette, dans dist-recette/ (construite et publiée par Cloudflare Pages, D-020)
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

// Deux applis servies par la même origine partagent IndexedDB, localStorage, sessionStorage et la liste
// des caches. La Recette a sa propre adresse chez Cloudflare, mais on ne compte pas que sur elle. Chaque nom de stockage porte un préfixe propre
// à la cible, pour que la Recette ne puisse jamais lire ni effacer les données de la prod.
// Les valeurs de la prod sont celles d'avant la Recette : le site de la prod reste identique au bit près.
const CIBLES = {
  prod: { out: 'dist', prefixe: 'prospection', nom: 'Prospection' },
  recette: { out: 'dist-recette', prefixe: 'prospection-recette', nom: 'Prospection Recette' },
};
const NOM_CIBLE = process.argv[2] || 'prod';
const CIBLE = CIBLES[NOM_CIBLE];
if (!CIBLE) throw new Error(`Cible inconnue : ${NOM_CIBLE} (prod ou recette)`);
const RECETTE = NOM_CIBLE === 'recette';

// Remplace un texte qui doit exister : si src/ ou public/ change, la construction de la Recette s'arrête
// au lieu de produire en silence une Recette qui partagerait quelque chose avec la prod.
function remplacer(texte, avant, apres, ou) {
  if (!texte.includes(avant)) throw new Error(`Construction de la Recette : « ${avant} » introuvable dans ${ou}`);
  return texte.replaceAll(avant, apres);
}

// Dans la Recette, les noms de stockage du code (src/) sont réécrits à l'assemblage.
// La prod est assemblée depuis src/ tel quel : son code ne bouge pas d'un octet.
const NOMS_STOCKAGE = {
  'src/db.js': [["const DB_NAME = 'prospection';", `const DB_NAME = '${CIBLE.prefixe}';`]],
  'src/theme.js': [["const KEY = 'prospection-theme';", `const KEY = '${CIBLE.prefixe}-theme';`]],
  'src/lock.js': [["'prospection-efface'", `'${CIBLE.prefixe}-efface'`]],
  'src/main.js': [["'prospection-efface'", `'${CIBLE.prefixe}-efface'`]],
};
const stockageRecette = {
  name: 'stockage-recette',
  setup(build) {
    const vus = new Set();
    build.onLoad({ filter: /[\\/]src[\\/](db|theme|lock|main)\.js$/ }, (args) => {
      const cle = relative(process.cwd(), args.path).split('\\').join('/');
      let code = readFileSync(args.path, 'utf8');
      for (const [avant, apres] of NOMS_STOCKAGE[cle] || []) code = remplacer(code, avant, apres, cle);
      vus.add(cle);
      return { contents: code, loader: 'js' };
    });
    build.onEnd(() => {
      for (const cle of Object.keys(NOMS_STOCKAGE)) if (!vus.has(cle)) throw new Error(`Construction de la Recette : ${cle} non réécrit`);
    });
  },
};

const OUT = CIBLE.out;
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
  plugins: RECETTE ? [stockageRecette] : [],
});

cpSync('public', OUT, { recursive: true });

if (RECETTE) {
  // Icônes orange (scripts/make-icons.mjs recette)
  cpSync('public-recette', OUT, { recursive: true });
  const m = JSON.parse(readFileSync(join(OUT, 'manifest.webmanifest'), 'utf8'));
  Object.assign(m, { name: CIBLE.nom, short_name: CIBLE.nom, description: `${m.description} (Recette : versions à vérifier avant la prod)` });
  writeFileSync(join(OUT, 'manifest.webmanifest'), JSON.stringify(m, null, 2) + '\n');
  const p = join(OUT, 'index.html');
  let html = readFileSync(p, 'utf8');
  html = remplacer(html, '<title>Prospection</title>', `<title>${CIBLE.nom}</title>`, 'index.html');
  html = remplacer(html, 'content="Prospection"', `content="${CIBLE.nom}"`, 'index.html (apple-mobile-web-app-title)');
  html = remplacer(html, "'prospection-theme'", `'${CIBLE.prefixe}-theme'`, 'index.html (couleur du thème)');
  // Bandeau RECETTE : par-dessus tout (écran du code compris), sans gêner les appuis,
  // en bas de la zone de l'heure quand l'appli passe dessous, en haut de l'écran sinon.
  const bandeau = `<div id="recette-bandeau" aria-hidden="true" style="position:fixed;left:0;right:0;top:max(0px,calc(env(safe-area-inset-top) - 16px));height:16px;z-index:2147483647;pointer-events:none;background:#ea580c;color:#fff;font:700 11px/16px -apple-system,system-ui,sans-serif;letter-spacing:.2em;text-align:center">RECETTE</div>`;
  html = remplacer(html, '<body>', `<body>\n    ${bandeau}`, 'index.html');
  writeFileSync(p, html);
}

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
const sw = readFileSync('scripts/sw.template.js', 'utf8')
  .replace('__VERSION__', VERSION)
  .replace('__PRECACHE__', JSON.stringify(precache))
  .replaceAll('__PREFIXE__', CIBLE.prefixe);
writeFileSync(join(OUT, 'sw.js'), sw);
writeFileSync(join(OUT, '.nojekyll'), '');

// Copie publiée par GitHub Pages (dossier docs/ du dépôt) : la prod seulement.
if (!RECETTE) {
  rmSync('docs', { recursive: true, force: true });
  cpSync(OUT, 'docs', { recursive: true });
}

const size = files.reduce((s, f) => s + statSync(f).size, 0);
console.log(`${CIBLE.nom} ${VERSION} : ${files.length} fichiers, ${(size / 1024).toFixed(0)} Ko, dans ${OUT}/`);
