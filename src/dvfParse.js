// Lecture des fichiers « geo-dvf » (ventes immobilières, data.gouv.fr).
// Module partagé : utilisé par le script de préparation (Node) et par le bouton « Mise à jour DVF » de l'appli.

const NATURES = {
  Vente: 'V',
  "Vente en l'état futur d'achèvement": 'N',
  Adjudication: 'A',
  'Vente terrain à bâtir': 'T',
};

// Lecteur CSV minimal (séparateur virgule, champs éventuellement entre guillemets).
export function parseCSV(text, sep = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const ABBR = {
  BD: 'Boulevard',
  AV: 'Avenue',
  R: 'Rue',
  RUE: 'Rue',
  ALL: 'Allée',
  PL: 'Place',
  IMP: 'Impasse',
  CHE: 'Chemin',
  CHEM: 'Chemin',
  SQ: 'Square',
  QUA: 'Quai',
  QU: 'Quai',
  RTE: 'Route',
  VLA: 'Villa',
  PAS: 'Passage',
  SEN: 'Sentier',
  CRS: 'Cours',
  RES: 'Résidence',
  SENT: 'Sentier',
  PROM: 'Promenade',
  CITE: 'Cité',
  CTRE: 'Centre',
  RPT: 'Rond-point',
};
const SMALL = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'aux', 'au', 'sur', "d'", "l'"]);

export function prettyVoie(s) {
  const words = String(s || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words
    .map((w, i) => {
      const up = w.toUpperCase();
      if (i === 0 && ABBR[up]) return ABBR[up];
      const low = w.toLowerCase();
      if (i > 0 && SMALL.has(low)) return low;
      return low.replace(/(^|[-'’])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
    })
    .join(' ');
}

// Regroupe les lignes d'un ou plusieurs fichiers geo-dvf en ventes.
// `locate(lon, lat)` renvoie { ilot, keep } : îlot (0 si hors îlot) et s'il faut garder la vente.
export function ventesFromRows(rows, locate) {
  const head = rows[0];
  const col = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
  const need = ['id_mutation', 'date_mutation', 'nature_mutation', 'valeur_fonciere', 'type_local', 'longitude', 'latitude'];
  for (const n of need) if (!(n in col)) throw new Error(`Colonne manquante dans le fichier DVF : ${n}`);
  const g = new Map();
  for (let k = 1; k < rows.length; k++) {
    const r = rows[k];
    if (r.length < head.length - 2) continue;
    const id = r[col.id_mutation];
    if (!g.has(id)) g.set(id, []);
    g.get(id).push(r);
  }
  const out = [];
  for (const [id, rs] of g) {
    const r0 = rs[0];
    const nat = NATURES[r0[col.nature_mutation]];
    if (!nat) continue;
    const prix = parseFloat(r0[col.valeur_fonciere]);
    if (!(prix > 0)) continue;
    // Biens principaux uniques (maisons et appartements), sans les doublons dus aux lignes de culture.
    const seen = new Set();
    const locaux = [];
    for (const r of rs) {
      const t = r[col.type_local];
      if (t !== 'Maison' && t !== 'Appartement') continue;
      const key = [r[col.id_parcelle], t, r[col.surface_reelle_bati], r[col.nombre_pieces_principales], r[col.lot1_numero]].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      locaux.push(r);
    }
    if (!locaux.length && nat !== 'T') continue;
    const terrains = new Map();
    for (const r of rs) {
      const st = parseFloat(r[col.surface_terrain]);
      if (st > 0) terrains.set(r[col.id_parcelle] + '|' + r[col.nature_culture], st);
    }
    const terrain = [...terrains.values()].reduce((a, b) => a + b, 0);
    const types = [...new Set(locaux.map((r) => r[col.type_local]))];
    const type = nat === 'T' && !locaux.length ? 'Terrain' : types.length === 1 ? types[0] : 'Plusieurs biens';
    const surface = locaux.reduce((s, r) => s + (parseFloat(r[col.surface_reelle_bati]) || 0), 0);
    const pieces = locaux.reduce((s, r) => s + (parseInt(r[col.nombre_pieces_principales], 10) || 0), 0);
    const ref = locaux[0] || r0;
    let lon = parseFloat(ref[col.longitude]);
    let lat = parseFloat(ref[col.latitude]);
    if (!(lon && lat)) {
      const withXY = rs.find((r) => parseFloat(r[col.longitude]) && parseFloat(r[col.latitude]));
      if (!withXY) continue;
      lon = parseFloat(withXY[col.longitude]);
      lat = parseFloat(withXY[col.latitude]);
    }
    const loc = locate(lon, lat);
    if (!loc || !loc.keep) continue;
    const num = (ref[col.adresse_numero] || '').trim();
    const suf = (ref[col.adresse_suffixe] || '').trim();
    const voie = prettyVoie(ref[col.adresse_nom_voie]);
    const adresse = [num + (suf ? ' ' + suf.toLowerCase() : ''), voie].filter(Boolean).join(' ');
    out.push([
      id,
      r0[col.date_mutation],
      Math.round(prix),
      type,
      Math.round(surface) || 0,
      pieces || 0,
      Math.round(terrain) || 0,
      adresse,
      Math.round(lon * 1e6) / 1e6,
      Math.round(lat * 1e6) / 1e6,
      locaux.length,
      nat,
      ref[col.id_parcelle] || '',
      loc.ilot || 0,
    ]);
  }
  out.sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0));
  return out;
}

// Index des champs d'une vente (format compact du fichier dvf.json).
export const V = { id: 0, date: 1, prix: 2, type: 3, surface: 4, pieces: 5, terrain: 6, adresse: 7, lon: 8, lat: 9, nb: 10, nature: 11, parcelle: 12, ilot: 13 };
export const NATURE_LABEL = { V: 'Vente', N: 'Vente sur plan (neuf)', A: 'Adjudication', T: 'Terrain à bâtir' };
