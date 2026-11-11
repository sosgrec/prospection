// Mise à jour des ventes DVF depuis data.gouv.fr (avec repli sur la copie publiée avec l'appli).
import { S, setSetting, getSetting } from './state.js';
import { parseCSV, ventesFromRows } from './dvfParse.js';
import { pointInRing, distM, todayStr } from './util.js';

const BUFFER_M = 150;
const COMMUNE = '94017';
const DEP = '94';

function distToRing(lon, lat, ring) {
  let d = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j];
    const [bx, by] = ring[i];
    // Projection approximative sur le segment
    const kx = Math.cos((lat * Math.PI) / 180);
    const dx = (bx - ax) * kx;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? (((lon - ax) * kx) * dx + (lat - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    d = Math.min(d, distM(lon, lat, ax + (bx - ax) * t, ay + (by - ay) * t));
  }
  return d;
}

export function locateForDvf(lon, lat) {
  for (const il of S.base.ilots) if (pointInRing(lon, lat, il.ring)) return { keep: true, ilot: il.id };
  for (const il of S.base.ilots) {
    const [a, b, c, d] = il.bbox;
    if (lon < a - 0.003 || lon > c + 0.003 || lat < b - 0.002 || lat > d + 0.002) continue;
    if (distToRing(lon, lat, il.ring) <= BUFFER_M) return { keep: true, ilot: 0 };
  }
  return { keep: false };
}

// Charge les ventes au démarrage : la version la plus récente entre celle de l'appli et celle déjà mise à jour.
export async function loadDvf() {
  const saved = getSetting('dvf');
  let bundled = null;
  try {
    const r = await fetch('data/dvf.json');
    if (r.ok) bundled = await r.json();
  } catch {
    /* hors connexion sans cache : on garde la version enregistrée */
  }
  S.dvf = !saved ? bundled : !bundled ? saved : saved.maj >= bundled.maj ? saved : bundled;
}

export async function updateDvf(onProgress = () => {}) {
  const year = new Date().getFullYear();
  const years = [];
  for (let y = year - 5; y <= year; y++) years.push(y);
  let ventes = [];
  const ok = [];
  for (const y of years) {
    onProgress(`Téléchargement des ventes ${y}…`);
    try {
      const r = await fetch(`https://files.data.gouv.fr/geo-dvf/latest/csv/${y}/communes/${DEP}/${COMMUNE}.csv`, { cache: 'no-store' });
      if (!r.ok) continue;
      const rows = parseCSV(await r.text());
      ventes = ventes.concat(ventesFromRows(rows, locateForDvf));
      ok.push(String(y));
    } catch {
      /* année absente ou site injoignable */
    }
  }
  let source = 'geo-dvf (data.gouv.fr)';
  let data;
  if (ok.length) {
    ventes.sort((a, b) => (a[1] < b[1] ? 1 : -1));
    data = { maj: todayStr(), source, annees: ok, ventes };
  } else {
    // Repli : copie publiée avec l'appli (mise à jour à chaque nouvelle version)
    onProgress('Récupération de la copie de l’appli…');
    const r = await fetch(`data/dvf.json?frais=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('Pas de connexion : réessaie quand tu auras du réseau.');
    data = await r.json();
    source = 'copie de l’appli';
  }
  await setSetting('dvf', data);
  S.dvf = data;
  return { data, direct: ok.length > 0, annees: ok, source };
}
