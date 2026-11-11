// Sauvegarde et restauration au format Excel (.xlsx), lisible dans Excel, Numbers ou Google Sheets.
import * as db from './db.js';
import { writeXlsx, readXlsx } from './xlsx.js';
import { S, setSetting, getSetting, addrLabel, contactMainAddress, activeContacts } from './state.js';
import { allPhotoRecords } from './photos.js';
import { dayStr, localDateTime, parseLocalDateTime, shareOrDownload, fmtDate, esc, plural } from './util.js';
import { dialog, toast, confirmDialog } from './ui.js';

export const FORMAT = 'prospection-sauvegarde';
export const FORMAT_VERSION = 1;
const CHUNK = 30000;

// ---------- Conversions ----------
const ouiNon = (b) => (b ? 'oui' : 'non');
const isOui = (v) => v === true || /^(oui|vrai|true|1|x)$/i.test(String(v ?? '').trim());
const str = (v) => (v === null || v === undefined ? '' : String(v));
const num = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
};
function excelSerialToLocal(serial) {
  const d = new Date(Math.round((serial - 25569) * 86400000));
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()).getTime();
}
const ts = (ms) => (ms ? localDateTime(ms) : '');
const parseTs = (v) => {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return v > 1e11 ? v : excelSerialToLocal(v);
  const t = parseLocalDateTime(v);
  return Number.isFinite(t) ? t : null;
};
const parseDayStr = (v) => {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return dayStr(excelSerialToLocal(v));
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const f = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return f ? `${f[3]}-${f[2].padStart(2, '0')}-${f[1].padStart(2, '0')}` : null;
};
const parseTime = (v) => {
  if (v === '' || v == null) return '';
  if (typeof v === 'number') {
    const mins = Math.round((v % 1) * 1440);
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }
  const m = String(v).match(/(\d{1,2})[:h](\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
};
const tags = (arr) => (arr || []).join(' ; ');
const parseTags = (v) =>
  str(v)
    .split(/\s*[;,]\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
const INTERET = ['aucun', 'tiède', 'chaud'];
const parseInteret = (v) => {
  const s = str(v).toLowerCase();
  const i = INTERET.findIndex((x) => s.startsWith(x.slice(0, 3)));
  return i >= 0 ? i : num(v) || 0;
};
const OCC = { proprietaire: 'propriétaire', locataire: 'locataire' };
const parseOcc = (v) => {
  const s = str(v).toLowerCase();
  if (s.startsWith('prop')) return 'proprietaire';
  if (s.startsWith('loc')) return 'locataire';
  return null;
};

// ---------- Tables : colonne → lecture / écriture ----------
// Chaque colonne : [entête, (objet) => valeur exportée, (objet, valeur) => import]
const TABLES = {
  contacts: {
    sheet: 'Contacts',
    widths: [12, 16, 18, 16, 26, 14, 10, 14, 10, 8, 14, 9, 40, 9, 12, 40, 30, 11, 12, 20, 40, 17, 17, 17],
    cols: [
      ['id', (c) => c.id, (o, v) => (o.id = str(v))],
      ['prenom', (c) => c.prenom, (o, v) => (o.prenom = str(v))],
      ['nom', (c) => c.nom, (o, v) => (o.nom = str(v))],
      ['telephone', (c) => c.tel, (o, v) => (o.tel = str(v))],
      ['email', (c) => c.email, (o, v) => (o.email = str(v))],
      ['occupation', (c) => OCC[c.occupation] || '', (o, v) => (o.occupation = parseOcc(v))],
      ['annee_arrivee', (c) => c.anneeArrivee, (o, v) => (o.anneeArrivee = num(v))],
      ['logement_type', (c) => c.logType, (o, v) => (o.logType = str(v))],
      ['surface_m2', (c) => c.surface, (o, v) => (o.surface = num(v))],
      ['pieces', (c) => c.pieces, (o, v) => (o.pieces = num(v))],
      ['etat', (c) => c.etat, (o, v) => (o.etat = str(v))],
      ['interet', (c) => INTERET[c.interet || 0], (o, v) => (o.interet = parseInteret(v))],
      ['projet', (c) => c.projet, (o, v) => (o.projet = str(v))],
      ['mandat_signe', (c) => ouiNon(c.mandatSigne), (o, v) => (o.mandatSigne = isOui(v))],
      ['mandat_date', (c) => c.mandatDate, (o, v) => (o.mandatDate = parseDayStr(v))],
      ['remarques', (c) => c.remarques, (o, v) => (o.remarques = str(v))],
      ['refus_notes', (c) => c.refusNote, (o, v) => (o.refusNote = str(v))],
      ['ne_plus_solliciter', (c) => ouiNon(c.nePlusSolliciter), (o, v) => (o.nePlusSolliciter = isOui(v))],
      ['ne_plus_solliciter_le', (c) => c.nePlusDate, (o, v) => (o.nePlusDate = parseDayStr(v))],
      ['etiquettes', (c) => tags(c.tags), (o, v) => (o.tags = parseTags(v))],
      ['adresse_principale', (c) => (contactMainAddress(c) ? addrLabel(contactMainAddress(c)) : ''), () => {}],
      ['cree_le', (c) => ts(c.createdAt), (o, v) => (o.createdAt = parseTs(v) || Date.now())],
      ['modifie_le', (c) => ts(c.updatedAt), (o, v) => (o.updatedAt = parseTs(v))],
      ['corbeille_le', (c) => ts(c.deletedAt), (o, v) => (o.deletedAt = parseTs(v))],
    ],
  },
  links: {
    sheet: 'Liens',
    widths: [12, 12, 26, 12, 22, 34],
    cols: [
      ['id', (l) => l.id, (o, v) => (o.id = str(v))],
      ['contact_id', (l) => l.contactId, (o, v) => (o.contactId = str(v))],
      ['adresse_id', (l) => l.addressId, (o, v) => (o.addressId = str(v))],
      ['appartement_id', (l) => l.logementId, (o, v) => (o.logementId = str(v) || null)],
      ['role', (l) => (l.role === 'proprio' ? 'propriétaire non occupant' : 'habitant'), (o, v) => (o.role = /prop/i.test(str(v)) ? 'proprio' : 'habitant')],
      ['adresse', (l) => addrLabel(l.addressId), () => {}],
    ],
  },
  addrs: {
    sheet: 'Adresses',
    widths: [26, 34, 8, 11, 12, 30, 24, 24, 40, 30, 40, 9, 8, 10, 22, 11, 11, 17],
    cols: [
      ['id', (u) => u.id, (o, v) => (o.id = str(v))],
      ['adresse', (u) => addrLabel(u.id), () => {}],
      ['ilot', (u) => S.addrs.get(u.id)?.ilot ?? u.ilot ?? '', (o, v) => (o.ilot = num(v) || 0)],
      ['type', (u) => u.type || '', (o, v) => (o.type = /imm/i.test(str(v)) ? 'immeuble' : /mais/i.test(str(v)) ? 'maison' : null)],
      ['couleur_choisie', (u) => u.color || '', (o, v) => (o.color = ['vert', 'orange', 'bleu', 'rouge', 'gris'].includes(str(v).toLowerCase()) ? str(v).toLowerCase() : null)],
      ['signaux', (u) => (u.signals || []).join(' ; '), (o, v) => (o.signals = parseTags(v))],
      ['autre_signal', (u) => u.signalAutre, (o, v) => (o.signalAutre = str(v))],
      ['etiquettes', (u) => tags(u.tags), (o, v) => (o.tags = parseTags(v))],
      ['note', (u) => u.note, (o, v) => (o.note = str(v))],
      ['acces', (u) => u.acces, (o, v) => (o.acces = str(v))],
      ['etages_json', (u) => (u.etages ? JSON.stringify(u.etages) : ''), (o, v) => (o.etages = v ? safeJSON(v, []) : undefined)],
      ['ajoutee', (u) => ouiNon(u.custom), (o, v) => (o.custom = isOui(v))],
      ['numero', (u) => (u.custom ? u.num : ''), (o, v) => (o.num = str(v))],
      ['complement', (u) => (u.custom ? u.rep : ''), (o, v) => (o.rep = str(v))],
      ['voie', (u) => (u.custom ? u.voie : ''), (o, v) => (o.voie = str(v))],
      ['longitude', (u) => (u.custom ? u.lon : ''), (o, v) => (o.lon = num(v))],
      ['latitude', (u) => (u.custom ? u.lat : ''), (o, v) => (o.lat = num(v))],
      ['couleur_le', (u) => u.colorAt || '', (o, v) => (o.colorAt = parseDayStr(v))],
      ['modifie_le', (u) => ts(u.updatedAt), (o, v) => (o.updatedAt = parseTs(v))],
    ],
  },
  logements: {
    sheet: 'Appartements',
    widths: [12, 26, 12, 7, 26, 12, 17],
    cols: [
      ['id', (l) => l.id, (o, v) => (o.id = str(v))],
      ['adresse_id', (l) => l.addressId, (o, v) => (o.addressId = str(v))],
      ['etage_id', (l) => l.etageId, (o, v) => (o.etageId = str(v))],
      ['ordre', (l) => l.order || 0, (o, v) => (o.order = num(v) || 0)],
      ['localisation', (l) => l.loc, (o, v) => (o.loc = str(v))],
      ['couleur_choisie', (l) => l.color || '', (o, v) => (o.color = str(v) || null)],
      ['cree_le', (l) => ts(l.createdAt), (o, v) => (o.createdAt = parseTs(v))],
    ],
  },
  passages: {
    sheet: 'Passages',
    widths: [12, 17, 26, 12, 12, 10, 12, 30, 34],
    cols: [
      ['id', (p) => p.id, (o, v) => (o.id = str(v))],
      ['date', (p) => ts(p.t), (o, v) => (o.t = parseTs(v))],
      ['adresse_id', (p) => p.addressId, (o, v) => (o.addressId = str(v))],
      ['appartement_id', (p) => p.logementId, (o, v) => (o.logementId = str(v) || null)],
      ['contact_id', (p) => p.contactId, (o, v) => (o.contactId = str(v) || null)],
      ['resultat', (p) => p.result, (o, v) => (o.result = ['absent', 'contact', 'refus'].includes(str(v).toLowerCase()) ? str(v).toLowerCase() : 'absent')],
      ['scenario_id', (p) => p.scenarioId, (o, v) => (o.scenarioId = str(v) || null)],
      ['note', (p) => p.note, (o, v) => (o.note = str(v))],
      ['adresse', (p) => addrLabel(p.addressId), () => {}],
    ],
  },
  relances: {
    sheet: 'Relances',
    widths: [12, 12, 12, 8, 40, 7, 17, 17],
    cols: [
      ['id', (r) => r.id, (o, v) => (o.id = str(v))],
      ['contact_id', (r) => r.contactId, (o, v) => (o.contactId = str(v) || null)],
      ['date', (r) => r.date, (o, v) => (o.date = parseDayStr(v))],
      ['heure', (r) => r.heure, (o, v) => (o.heure = parseTime(v))],
      ['objet', (r) => r.objet, (o, v) => (o.objet = str(v))],
      ['faite', (r) => ouiNon(r.done), (o, v) => (o.done = isOui(v))],
      ['faite_le', (r) => ts(r.doneAt), (o, v) => (o.doneAt = parseTs(v))],
      ['cree_le', (r) => ts(r.createdAt), (o, v) => (o.createdAt = parseTs(v))],
    ],
  },
  scenarios: {
    sheet: 'Scenarios',
    widths: [12, 34, 60, 17, 17],
    cols: [
      ['id', (s) => s.id, (o, v) => (o.id = str(v))],
      ['titre', (s) => s.titre, (o, v) => (o.titre = str(v))],
      ['texte', (s) => s.texte, (o, v) => (o.texte = str(v))],
      ['cree_le', (s) => ts(s.createdAt), (o, v) => (o.createdAt = parseTs(v))],
      ['corbeille_le', (s) => ts(s.deletedAt), (o, v) => (o.deletedAt = parseTs(v))],
    ],
  },
};
function safeJSON(v, def) {
  try {
    return JSON.parse(v);
  } catch {
    return def;
  }
}

function tableRows(key, items) {
  const t = TABLES[key];
  return [t.cols.map((c) => c[0]), ...items.map((it) => t.cols.map((c) => c[1](it) ?? ''))];
}

async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
function base64ToBlob(b64, type = 'image/jpeg') {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type });
}

export async function buildBackup() {
  const photos = await allPhotoRecords();
  const photoRows = [];
  let maxParts = 1;
  for (const p of photos) {
    const b64 = p.blob ? await blobToBase64(p.blob) : '';
    const parts = [];
    for (let i = 0; i < b64.length; i += CHUNK) parts.push(b64.slice(i, i + CHUNK));
    maxParts = Math.max(maxParts, parts.length);
    photoRows.push([p.id, p.addressId, ts(p.createdAt), p.w, p.h, p.blob?.type || 'image/jpeg', parts.length, ...parts]);
  }
  const settings = [...S.settings.values()].filter((s) => !['dvf', 'mapView'].includes(s.id));
  const counts = {
    contacts: S.contacts.size,
    passages: S.passages.size,
    relances: S.relances.size,
    scenarios: S.scenarios.size,
    appartements: S.logements.size,
    photos: photos.length,
  };
  const sheets = [
    {
      name: 'Infos',
      widths: [24, 40],
      rows: [
        ['cle', 'valeur'],
        ['format', FORMAT],
        ['version_format', FORMAT_VERSION],
        ['exporte_le', localDateTime(Date.now())],
        ...Object.entries(counts).map(([k, v]) => [`nombre_${k}`, v]),
        ['note', 'Ne modifie pas les colonnes « id » : elles relient les feuilles entre elles.'],
      ],
    },
    { name: TABLES.contacts.sheet, widths: TABLES.contacts.widths, rows: tableRows('contacts', [...S.contacts.values()]) },
    { name: TABLES.addrs.sheet, widths: TABLES.addrs.widths, rows: tableRows('addrs', [...S.addrUser.values()]) },
    { name: TABLES.logements.sheet, widths: TABLES.logements.widths, rows: tableRows('logements', [...S.logements.values()]) },
    { name: TABLES.links.sheet, widths: TABLES.links.widths, rows: tableRows('links', [...S.links.values()]) },
    { name: TABLES.passages.sheet, widths: TABLES.passages.widths, rows: tableRows('passages', [...S.passages.values()].sort((a, b) => a.t - b.t)) },
    { name: TABLES.relances.sheet, widths: TABLES.relances.widths, rows: tableRows('relances', [...S.relances.values()]) },
    { name: TABLES.scenarios.sheet, widths: TABLES.scenarios.widths, rows: tableRows('scenarios', [...S.scenarios.values()]) },
    { name: 'Reglages', widths: [20, 60], rows: [['cle', 'valeur_json'], ...settings.map((s) => [s.id, JSON.stringify(s.value)])] },
    {
      name: 'Photos',
      widths: [12, 26, 17, 8, 8, 12, 8],
      rows: [['id', 'adresse_id', 'cree_le', 'largeur', 'hauteur', 'type', 'nb_parties', ...Array.from({ length: maxParts }, (_, i) => `partie_${i + 1}`)], ...photoRows],
    },
  ];
  return { bytes: writeXlsx(sheets), counts };
}

export async function exportBackup() {
  const { bytes, counts } = await buildBackup();
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const name = `prospection-sauvegarde-${dayStr()}.xlsx`;
  const r = await shareOrDownload(blob, name, 'Sauvegarde Prospection');
  if (r !== 'aborted') {
    await setSetting('lastExport', Date.now());
    toast(`Sauvegarde exportée (${plural(counts.contacts, 'contact', 'contacts')})`);
  }
  return r;
}

// ---------- Restauration ----------
function rowsToObjects(rows, key) {
  const t = TABLES[key];
  if (!rows?.length) return [];
  const head = rows[0].map((h) => str(h).trim());
  const out = [];
  for (const r of rows.slice(1)) {
    if (!r || r.every((v) => v === '' || v == null)) continue;
    const o = {};
    for (const [name, , set] of t.cols) {
      const i = head.indexOf(name);
      if (i >= 0) set(o, r[i]);
    }
    if (!o.id) continue;
    out.push(o);
  }
  return out;
}

export function parseBackup(bytes) {
  const wb = readXlsx(bytes);
  const infos = wb.Infos;
  const map = Object.fromEntries((infos || []).slice(1).map((r) => [str(r[0]), r[1]]));
  if (map.format !== FORMAT) throw new Error('Ce fichier n’est pas une sauvegarde de Prospection.');
  if (num(map.version_format) > FORMAT_VERSION) throw new Error('Cette sauvegarde vient d’une version plus récente de l’appli.');
  const data = {};
  for (const [key, t] of Object.entries(TABLES)) data[key] = rowsToObjects(wb[t.sheet], key);
  // Nettoyage des valeurs indéfinies
  for (const arr of Object.values(data)) for (const o of arr) for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  for (const p of data.passages) if (!p.t) p.t = Date.now();
  data.settings = (wb.Reglages || [])
    .slice(1)
    .filter((r) => r[0])
    .map((r) => ({ id: str(r[0]), value: safeJSON(r[1], null) }));
  data.photos = [];
  const ph = wb.Photos || [];
  const head = (ph[0] || []).map(str);
  const ip = head.indexOf('partie_1');
  for (const r of ph.slice(1)) {
    if (!r?.[0] || ip < 0) continue;
    const n = num(r[head.indexOf('nb_parties')]) || 1;
    const b64 = r.slice(ip, ip + n).map(str).join('');
    if (!b64) continue;
    data.photos.push({ id: str(r[0]), addressId: str(r[1]), createdAt: parseTs(r[2]) || Date.now(), w: num(r[3]), h: num(r[4]), blob: base64ToBlob(b64, str(r[head.indexOf('type')]) || 'image/jpeg') });
  }
  return { data, exportedAt: str(map.exporte_le) };
}

export function pickBackupFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve(input.files?.[0] || null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

export async function restoreFromFile() {
  const file = await pickBackupFile();
  if (!file) return false;
  let parsed;
  try {
    parsed = parseBackup(new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    await dialog({ title: 'Restauration impossible', body: `<p>${esc(e.message || 'Fichier illisible.')}</p>`, buttons: [{ label: 'OK', value: true, kind: 'primary' }] });
    return false;
  }
  const d = parsed.data;
  const ok = await confirmDialog(
    `Sauvegarde du ${parsed.exportedAt || 'date inconnue'} : ${plural(d.contacts.length, 'contact', 'contacts')}, ${plural(d.passages.length, 'passage', 'passages')}, ${plural(d.relances.length, 'relance', 'relances')}, ${plural(d.photos.length, 'photo', 'photos')}. Elle remplacera toutes les données actuelles de l’appli. Conseil : exporte d’abord les données actuelles si tu as un doute.`,
    { title: 'Restaurer cette sauvegarde ?', ok: 'Remplacer mes données', danger: true },
  );
  if (!ok) return false;
  const lastExport = getSetting('lastExport');
  await db.replaceAll(d);
  if (lastExport) await db.put('settings', { id: 'lastExport', value: lastExport });
  toast('Sauvegarde restaurée');
  setTimeout(() => location.reload(), 600);
  return true;
}

export function backupAgeDays() {
  const t = getSetting('lastExport');
  if (!t) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

export const hasUserData = () => S.contacts.size + S.passages.size + S.addrUser.size + S.scenarios.size > 0;
export { fmtDate };
