// Prépare les données publiques de l'appli à partir des fichiers bruts (dossier data-src/raw) :
//   parcelles.json.gz, batiments.json.gz (cadastre Etalab), bano-94.json.gz ou adresses-94.csv.gz (adresses),
//   dvf-*.csv (ventes geo-dvf). Produit public/data/base.json et public/data/dvf.json.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { readIlots, makeIlotLocator, ringCentroid, bboxOf, round6, roundRing, streetLabel, pointInRing, distToRingM } from './geo.mjs';
import { parseCSV, ventesFromRows } from '../src/dvfParse.js';

const RAW = process.argv[2] || 'data-src/raw';
const INSEE = '94017';
const CONTEXT_M = 60; // bande de contexte autour des îlots (parcelles et bâtiments affichés en gris clair)
const ADDR_TOL_M = 15; // une adresse à moins de 15 m du bord d'un îlot y est rattachée
const DVF_BUFFER_M = 150; // ventes gardées jusqu'à 150 m autour des îlots

const readGz = (f) => gunzipSync(readFileSync(join(RAW, f))).toString('utf8');
const ilots = readIlots('data-src/ilots.kml');
const locate = makeIlotLocator(ilots);
const nearIlots = (pt, m) => ilots.some((il) => pointInRing(pt, il.ring) || distToRingM(pt, il.ring) <= m);
const ilotBoxes = ilots.map((il) => bboxOf([il.ring]));
const DEG_M_LAT = 1 / 110540;
const DEG_M_LON = 1 / 73300;
const nearBox = (pt, m) =>
  ilotBoxes.some(([a, b, c, d]) => pt[0] >= a - m * DEG_M_LON && pt[0] <= c + m * DEG_M_LON && pt[1] >= b - m * DEG_M_LAT && pt[1] <= d + m * DEG_M_LAT);

// ---------- Parcelles ----------
const parcFC = JSON.parse(readGz('parcelles.json.gz'));
const allParcels = parcFC.features.map((f) => {
  const rings = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates[0];
  return { id: f.id || f.properties.id, cont: f.properties.contenance || 0, rings, bb: bboxOf([rings[0]]), c: ringCentroid(rings[0]) };
});
// Index en grille pour retrouver la parcelle d'un point.
const CELL = 0.002;
const grid = new Map();
const gkey = (x, y) => `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;
allParcels.forEach((p, i) => {
  for (let x = Math.floor(p.bb[0] / CELL); x <= Math.floor(p.bb[2] / CELL); x++)
    for (let y = Math.floor(p.bb[1] / CELL); y <= Math.floor(p.bb[3] / CELL); y++) {
      const k = `${x}:${y}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    }
});
// Parcelle d'une adresse : celle qui la contient, sinon la plus proche à moins de `maxM` mètres.
// Les points d'adresse sont souvent posés en limite de parcelle, côté rue, à 1 ou 3 m à l'extérieur.
function parcelNear(pt, maxM = 10) {
  const cx = Math.floor(pt[0] / CELL);
  const cy = Math.floor(pt[1] / CELL);
  let best = -1;
  let bestD = Infinity;
  const seen = new Set();
  for (let x = cx - 1; x <= cx + 1; x++)
    for (let y = cy - 1; y <= cy + 1; y++)
      for (const i of grid.get(`${x}:${y}`) || []) {
        if (seen.has(i)) continue;
        seen.add(i);
        const p = allParcels[i];
        const m = maxM * DEG_M_LON;
        if (pt[0] < p.bb[0] - m || pt[0] > p.bb[2] + m || pt[1] < p.bb[1] - m || pt[1] > p.bb[3] + m) continue;
        if (pointInRing(pt, p.rings[0])) return { i, d: 0 };
        const d = distToRingM(pt, p.rings[0]);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
  return bestD <= maxM ? { i: best, d: bestD } : null;
}
const bboxOverlap = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

const keptParcel = new Map(); // index dans allParcels → îlot (0 = contexte)
allParcels.forEach((p, i) => {
  if (!nearBox(p.c, CONTEXT_M + 200)) return;
  const l = locate(p.c, 3);
  if (l) keptParcel.set(i, l.id);
  else if (nearIlots(p.c, CONTEXT_M)) keptParcel.set(i, 0);
});

// ---------- Adresses ----------
const voies = [];
const voieIdx = new Map();
const addVoie = (n) => {
  if (!voieIdx.has(n)) {
    voieIdx.set(n, voies.length);
    voies.push(n);
  }
  return voieIdx.get(n);
};
const rawAddr = []; // { id, num, rep, voie, lon, lat }
const files = readdirSync(RAW);
if (files.includes('bano-94.json.gz')) {
  for (const line of readGz('bano-94.json.gz').split('\n')) {
    if (!line.includes(`"citycode":"${INSEE}"`)) continue;
    const o = JSON.parse(line);
    if (!o.housenumbers) continue;
    for (const [key, pos] of Object.entries(o.housenumbers)) {
      const m = key.trim().match(/^(\d+)\s*(.*)$/);
      if (!m) continue;
      let rep = m[2].trim().replace(/^[,/]\s*/, '');
      rep = rep.replace(/^(bis|ter|quater)$/i, (x) => x.toLowerCase());
      rawAddr.push({ id: `${o.id}_${m[1]}${rep ? '_' + rep.replace(/\s+/g, '') : ''}`, num: m[1], rep, voie: o.name, lon: pos.lon, lat: pos.lat });
    }
  }
} else if (files.includes('adresses-94.csv.gz')) {
  const rows = parseCSV(readGz('adresses-94.csv.gz'), ';');
  const c = Object.fromEntries(rows[0].map((h, i) => [h, i]));
  for (const r of rows.slice(1)) {
    if (r[c.code_insee] !== INSEE) continue;
    rawAddr.push({ id: r[c.id], num: r[c.numero], rep: r[c.rep] || '', voie: r[c.nom_voie], lon: +r[c.lon], lat: +r[c.lat] });
  }
} else throw new Error('Fichier d’adresses introuvable (bano-94.json.gz ou adresses-94.csv.gz)');

// Rattachement d'une adresse à un îlot : par le centre de sa parcelle (robuste quand le point
// est posé côté rue), sinon par le point lui-même s'il est dans l'îlot.
const seenIds = new Set();
const adresses = [];
const border = {};
const viaPoint = {};
for (const a of rawAddr) {
  const pt = [a.lon, a.lat];
  if (!nearBox(pt, ADDR_TOL_M + 40)) continue;
  if (seenIds.has(a.id)) continue;
  const near = parcelNear(pt, 10);
  let ilot = null;
  if (near) {
    const p = allParcels[near.i];
    const l = locate(p.c, 3);
    if (l) ilot = l.id;
    else {
      // Grande parcelle à cheval : on garde si le point est dans l'îlot et que la parcelle le chevauche.
      const lp = locate(pt, 0);
      if (lp && bboxOverlap(p.bb, ilotBoxes[ilots.findIndex((x) => x.id === lp.id)])) ilot = lp.id;
    }
  } else {
    const lp = locate(pt, 0);
    if (lp) {
      ilot = lp.id;
      viaPoint[ilot] = (viaPoint[ilot] || 0) + 1;
    }
  }
  if (ilot == null) continue;
  seenIds.add(a.id);
  if (!locate(pt, 0)) border[ilot] = (border[ilot] || 0) + 1;
  const pi = near ? near.i : -1;
  if (pi >= 0 && !keptParcel.get(pi)) keptParcel.set(pi, ilot);
  adresses.push({ ...a, ilot, pi });
}

// Tri par îlot, voie puis numéro, pour des listes lisibles.
adresses.sort((x, y) => x.ilot - y.ilot || x.voie.localeCompare(y.voie, 'fr') || +x.num - +y.num || x.rep.localeCompare(y.rep));

// Renumérotation compacte des parcelles gardées.
const parcelOrder = [...keptParcel.keys()].sort((a, b) => a - b);
const newIdx = new Map(parcelOrder.map((old, k) => [old, k]));
const parcelles = parcelOrder.map((old) => {
  const p = allParcels[old];
  return [p.id, p.cont, keptParcel.get(old), p.rings.map(roundRing)];
});

const adressesOut = adresses.map((a) => [a.id, a.num, a.rep, addVoie(a.voie), round6(a.lon), round6(a.lat), a.ilot, a.pi >= 0 ? [newIdx.get(a.pi)] : []]);

// ---------- Bâtiments ----------
const batFC = JSON.parse(readGz('batiments.json.gz'));
const batiments = [];
for (const f of batFC.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const rings of polys) {
    const c = ringCentroid(rings[0]);
    if (!nearBox(c, CONTEXT_M + 50)) continue;
    const l = locate(c, 2);
    let il = l ? l.id : -1;
    if (il < 0 && nearIlots(c, CONTEXT_M)) il = 0;
    if (il < 0) continue;
    batiments.push([il, rings.map(roundRing), f.properties.type === '02' ? 1 : 0]);
  }
}

// ---------- Étiquettes de rues ----------
const groups = new Map();
for (const a of adresses) {
  const k = `${a.voie}|${a.ilot}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push([a.lon, a.lat]);
}
const rues = [];
for (const [k, pts] of groups) {
  if (pts.length < 2) continue;
  const l = streetLabel(pts);
  if (l.len < 25) continue;
  rues.push([voieIdx.get(k.split('|')[0]), l.lon, l.lat, l.deg]);
}

const base = {
  version: new Date().toISOString().slice(0, 10),
  genere: new Date().toISOString(),
  commune: 'Champigny-sur-Marne',
  sources: { adresses: files.includes('bano-94.json.gz') ? 'BANO (OpenStreetMap France)' : 'Base Adresse Nationale', cadastre: 'Cadastre Etalab (DGFiP)' },
  ilots: ilots.map((i) => ({ ...i, bbox: bboxOf([i.ring]).map(round6) })),
  voies,
  adresses: adressesOut,
  parcelles,
  batiments,
  rues,
};
writeFileSync('public/data/base.json', JSON.stringify(base));

// ---------- Ventes DVF ----------
const dvfFiles = files.filter((f) => /^dvf-\d{4}\.csv$/.test(f)).sort();
let ventes = [];
for (const f of dvfFiles) {
  const rows = parseCSV(readFileSync(join(RAW, f), 'utf8'));
  ventes = ventes.concat(
    ventesFromRows(rows, (lon, lat) => {
      const pt = [lon, lat];
      if (!nearBox(pt, DVF_BUFFER_M)) return { keep: false };
      const l = locate(pt, 0);
      if (l) return { keep: true, ilot: l.id };
      return { keep: nearIlots(pt, DVF_BUFFER_M), ilot: 0 };
    }),
  );
}
ventes.sort((a, b) => (a[1] < b[1] ? 1 : -1));
const annees = dvfFiles.map((f) => f.slice(4, 8));
writeFileSync('public/data/dvf.json', JSON.stringify({ maj: new Date().toISOString().slice(0, 10), source: 'geo-dvf (data.gouv.fr)', annees, ventes }));

// ---------- Bilan ----------
const per = {};
for (const a of adresses) per[a.ilot] = (per[a.ilot] || 0) + 1;
const perV = {};
for (const v of ventes) perV[v[13]] = (perV[v[13]] || 0) + 1;
console.log('Îlot | adresses | dont en bordure | ventes dans l’îlot');
for (const il of ilots) console.log(`${String(il.id).padStart(2)} ${il.nom.padEnd(20)} | ${String(per[il.id] || 0).padStart(4)} | ${String(border[il.id] || 0).padStart(3)} | ${perV[il.id] || 0}`);
console.log(`Total : ${adresses.length} adresses, ${parcelles.length} parcelles (dont contexte ${parcelles.filter((p) => !p[2]).length}), ${batiments.length} bâtiments, ${rues.length} étiquettes de rues, ${ventes.length} ventes (${perV[0] || 0} autour des îlots)`);
const noParcel = adresses.filter((a) => a.pi < 0).length;
console.log(`Adresses sans parcelle trouvée : ${noParcel} ; rattachées par le seul point : ${JSON.stringify(viaPoint)}`);
