// Met à jour les ventes DVF (public/data/dvf.json) depuis data.gouv.fr.
// Lancé chaque mois par GitHub Actions. Option : --dossier <chemin> pour lire des fichiers dvf-AAAA.csv locaux.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readIlots, makeIlotLocator, pointInRing, distToRingM, bboxOf } from './geo.mjs';
import { parseCSV, ventesFromRows } from '../src/dvfParse.js';

const COMMUNE = '94017';
const DEP = '94';
const BUFFER_M = 150;
const OUT = 'public/data/dvf.json';
const LOG = 'data-src/dvf-derniere-verification.txt';

const args = process.argv.slice(2);
const dossier = args.includes('--dossier') ? args[args.indexOf('--dossier') + 1] : null;

const ilots = readIlots('data-src/ilots.kml');
const locateIlot = makeIlotLocator(ilots);
const boxes = ilots.map((il) => bboxOf([il.ring]));
const near = (pt) =>
  boxes.some(([a, b, c, d]) => pt[0] >= a - 0.003 && pt[0] <= c + 0.003 && pt[1] >= b - 0.002 && pt[1] <= d + 0.002) &&
  ilots.some((il) => pointInRing(pt, il.ring) || distToRingM(pt, il.ring) <= BUFFER_M);
const locate = (lon, lat) => {
  const pt = [lon, lat];
  if (!near(pt)) return { keep: false };
  const l = locateIlot(pt, 0);
  return { keep: true, ilot: l ? l.id : 0 };
};

async function lireAnnee(y) {
  if (dossier) {
    const f = join(dossier, `dvf-${y}.csv`);
    return existsSync(f) ? readFileSync(f, 'utf8') : null;
  }
  const url = `https://files.data.gouv.fr/geo-dvf/latest/csv/${y}/communes/${DEP}/${COMMUNE}.csv`;
  const r = await fetch(url);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
  return r.text();
}

const an = new Date().getFullYear();
const annees = [];
let ventes = [];
for (let y = an - 5; y <= an; y++) {
  const txt = await lireAnnee(y);
  if (!txt) continue;
  ventes = ventes.concat(ventesFromRows(parseCSV(txt), locate));
  annees.push(String(y));
}
if (!annees.length) {
  console.error('Aucune année DVF récupérée : fichier inchangé.');
  process.exit(1);
}
ventes.sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : a[0] < b[0] ? -1 : 1));

const ancien = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const trier = (vs) => [...vs].sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : a[0] < b[0] ? -1 : 1));
const identique = ancien && JSON.stringify(trier(ancien.ventes)) === JSON.stringify(ventes);
const jour = new Date().toISOString().slice(0, 10);
if (identique) {
  console.log(`Aucune nouvelle vente (${ventes.length} ventes, années ${annees.join(', ')}).`);
} else {
  writeFileSync(OUT, JSON.stringify({ maj: jour, source: 'geo-dvf (data.gouv.fr)', annees, ventes }));
  console.log(`Ventes mises à jour : ${ventes.length} ventes (avant : ${ancien?.ventes.length ?? 0}), années ${annees.join(', ')}.`);
}
mkdirSync('data-src', { recursive: true });
writeFileSync(LOG, `Dernière vérification des ventes DVF : ${jour}\nVentes : ${ventes.length}\nAnnées : ${annees.join(', ')}\nChangement : ${identique ? 'non' : 'oui'}\n`);
