// Outils géométriques partagés par les scripts de préparation des données.
// Les coordonnées sont en [lon, lat] (ordre GeoJSON).

import { readFileSync } from 'node:fs';

export const SECTEURS = {
  4: 'Centre Ville',
  20: 'Maroc / La Roseraie',
  29: 'Musselburgh',
  42: 'Diderot',
  45: 'Bel-Air',
  60: 'Blaise Pascal',
  68: 'Polangis',
  77: 'Tremblay',
  84: 'Plant',
};

// Projection locale en mètres (équirectangulaire), largement suffisante à l'échelle d'une commune.
const LAT0 = 48.817;
const KX = Math.cos((LAT0 * Math.PI) / 180) * 111320;
const KY = 110540;
export const proj = ([lon, lat]) => [lon * KX, lat * KY];

export function pointInRing(pt, ring) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distPointSegM(p, a, b) {
  const [px, py] = proj(p);
  const [ax, ay] = proj(a);
  const [bx, by] = proj(b);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function distToRingM(pt, ring) {
  let d = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) d = Math.min(d, distPointSegM(pt, ring[j], ring[i]));
  return d;
}

export function ringCentroid(ring) {
  // Centroïde de surface (formule du polygone), repli sur la moyenne des sommets.
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j];
    const [x1, y1] = ring[i];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-14) {
    const n = ring.length;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function bboxOf(rings) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rings)
    for (const [x, y] of r) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  return [minX, minY, maxX, maxY];
}

export const round6 = (n) => Math.round(n * 1e6) / 1e6;
export const roundRing = (ring) => ring.map(([x, y]) => [round6(x), round6(y)]);

// Lecture des 9 îlots rouges de la carte My Maps exportée en KML.
export function readIlots(kmlPath) {
  const kml = readFileSync(kmlPath, 'utf8');
  const placemarks = kml.split('<Placemark>').slice(1);
  const ilots = [];
  for (const pm of placemarks) {
    const style = (pm.match(/<styleUrl>([^<]+)<\/styleUrl>/) || [])[1] || '';
    if (!style.includes('FF5252')) continue;
    const name = ((pm.match(/<name>([^<]+)<\/name>/) || [])[1] || '').trim();
    const num = Number((name.match(/(\d+)/) || [])[1]);
    const coords = (pm.match(/<coordinates>([\s\S]*?)<\/coordinates>/) || [])[1];
    if (!num || !coords) continue;
    const ring = coords
      .trim()
      .split(/\s+/)
      .map((t) => t.split(',').slice(0, 2).map(Number));
    ilots.push({ id: num, nom: SECTEURS[num] || `Îlot ${num}`, ring: roundRing(ring) });
  }
  ilots.sort((a, b) => a.id - b.id);
  if (ilots.length !== 9) throw new Error(`9 îlots attendus, ${ilots.length} trouvés`);
  return ilots;
}

// Rattache un point à un îlot : à l'intérieur, ou à moins de `tol` mètres du bord.
export function makeIlotLocator(ilots) {
  return function locate(pt, tol = 0) {
    for (const il of ilots) if (pointInRing(pt, il.ring)) return { id: il.id, d: 0 };
    if (!tol) return null;
    let best = null;
    for (const il of ilots) {
      const d = distToRingM(pt, il.ring);
      if (d <= tol && (!best || d < best.d)) best = { id: il.id, d };
    }
    return best;
  };
}

// Étiquettes de rues : axe principal (ACP) des adresses d'une même voie dans un îlot.
export function streetLabel(points) {
  const P = points.map(proj);
  const n = P.length;
  const mx = P.reduce((s, p) => s + p[0], 0) / n;
  const my = P.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of P) {
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy); // angle de l'axe, sens trigonométrique
  // Étendue le long de l'axe, pour ne pas étiqueter les voies trop courtes.
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  let lo = Infinity;
  let hi = -Infinity;
  for (const [x, y] of P) {
    const t = (x - mx) * ux + (y - my) * uy;
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
  }
  let deg = (-theta * 180) / Math.PI; // rotation CSS (sens horaire, écran)
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  const lon = points.reduce((s, p) => s + p[0], 0) / n;
  const lat = points.reduce((s, p) => s + p[1], 0) / n;
  return { lon: round6(lon), lat: round6(lat), deg: Math.round(deg), len: hi - lo };
}
