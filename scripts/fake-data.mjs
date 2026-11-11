// Données factices pour développer et tester l'interface avant l'arrivée des vraies données.
// Elles ont exactement le même format que celles produites par build-data.mjs.
import { writeFileSync, mkdirSync } from 'node:fs';
import { readIlots, pointInRing, bboxOf, round6, streetLabel } from './geo.mjs';

const ilots = readIlots('data-src/ilots.kml');
const voies = [];
const adresses = [];
const parcelles = [];
const batiments = [];
const rues = [];
let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const dLat = 22 / 110540; // ~22 m entre deux adresses
const dLon = 22 / 73300;
for (const il of ilots) {
  const [x0, y0, x1, y1] = bboxOf([il.ring]);
  let row = 0;
  for (let lat = y0 + dLat / 2; lat < y1; lat += dLat, row++) {
    const vIdx = voies.length;
    voies.push(`Rue Exemple ${il.id}-${row + 1}`);
    let num = 1;
    const pts = [];
    for (let lon = x0 + dLon / 2; lon < x1; lon += dLon) {
      if (!pointInRing([lon, lat], il.ring)) continue;
      const pIdx = parcelles.length;
      const h = 9 / 110540;
      const w = 9 / 73300;
      const ring = [
        [lon - w, lat - h],
        [lon + w, lat - h],
        [lon + w, lat + h],
        [lon - w, lat + h],
        [lon - w, lat - h],
      ].map(([a, b]) => [round6(a), round6(b)]);
      parcelles.push([`94017000ZZ${String(pIdx).padStart(4, '0')}`, Math.round(200 + rnd() * 500), il.id, [ring]]);
      const bw = w * 0.55;
      const bh = h * 0.5;
      batiments.push([
        il.id,
        [
          [
            [lon - bw, lat - bh],
            [lon + bw, lat - bh],
            [lon + bw, lat + bh],
            [lon - bw, lat + bh],
            [lon - bw, lat - bh],
          ].map(([a, b]) => [round6(a), round6(b)]),
        ],
      ]);
      const rep = rnd() < 0.05 ? 'bis' : '';
      adresses.push([`94017_f${il.id}_${row}_${num}`, num, rep, vIdx, round6(lon), round6(lat - h * 0.7), il.id, [pIdx]]);
      pts.push([lon, lat]);
      num += 2;
    }
    if (pts.length >= 2) {
      const l = streetLabel(pts);
      rues.push([vIdx, l.lon, l.lat, l.deg]);
    }
  }
}

const base = {
  version: 'factice',
  genere: new Date().toISOString().slice(0, 10),
  commune: 'Champigny-sur-Marne',
  ilots: ilots.map((i) => ({ ...i, bbox: bboxOf([i.ring]).map(round6) })),
  voies,
  adresses,
  parcelles,
  batiments,
  rues,
};
mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/base.json', JSON.stringify(base));

const types = ['Maison', 'Appartement'];
const ventes = [];
for (let k = 0; k < 120; k++) {
  const a = adresses[Math.floor(rnd() * adresses.length)];
  const t = types[rnd() < 0.5 ? 0 : 1];
  const s = Math.round(t === 'Maison' ? 70 + rnd() * 80 : 25 + rnd() * 60);
  const y = 2021 + Math.floor(rnd() * 5);
  const m = 1 + Math.floor(rnd() * 12);
  ventes.push([
    `fake-${k}`,
    `${y}-${String(m).padStart(2, '0')}-15`,
    Math.round(s * (3500 + rnd() * 2000)),
    t,
    s,
    Math.round(1 + s / 25),
    t === 'Maison' ? Math.round(200 + rnd() * 300) : 0,
    `${a[1]} ${voies[a[3]]}`,
    a[4],
    a[5],
    1,
  ]);
}
writeFileSync('public/data/dvf.json', JSON.stringify({ maj: 'factice', source: 'factice', ventes }));
console.log(`factice : ${adresses.length} adresses, ${parcelles.length} parcelles, ${ventes.length} ventes`);
