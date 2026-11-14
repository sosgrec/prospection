// État de l'appli en mémoire + règles métier (couleurs, statuts, relances…).
// Chaque modification est écrite immédiatement dans IndexedDB.
import * as db from './db.js';
import { uid, norm, phoneKey, startOfDay, todayStr, parseDay } from './util.js';

export const COLORS = {
  vert: { label: 'Propriétaire', hex: '#1f9d55' },
  orange: { label: 'Locataire', hex: '#f08c00' },
  bleu: { label: 'Immeuble', hex: '#2563eb' },
  rouge: { label: 'Pas de démarchage', hex: '#dc2626' },
  gris: { label: 'Statut inconnu', hex: '#8b939c' },
};
export const SIGNALS = {
  vide: 'Maison vide',
  succession: 'Succession',
  panneau: 'Panneau à vendre concurrent',
  travaux: 'Gros travaux',
};
export const RESULTS = { absent: 'Absent', contact: 'Contact', refus: 'Refus' };
export const ROLES = { habitant: 'Habitant', proprio: 'Propriétaire non occupant' };
export const INTERETS = ['Aucun', 'Tiède', 'Chaud'];
export const OCCUPATIONS = { proprietaire: 'Propriétaire', locataire: 'Locataire' };
export const LOGEMENT_TYPES = ['Maison', 'Appartement', 'Studio', 'Duplex', 'Autre'];
export const ETATS = ['À rénover', 'Correct', 'Bon état', 'Refait à neuf'];
export const ACCORD_MODES = { oral: 'À l’oral', ecrit: 'Par écrit', message: 'SMS / email' };

export const S = {
  base: null, // données publiques (îlots, adresses, parcelles…)
  addrs: new Map(), // adresses de base + adresses ajoutées à la main, par id
  ilots: new Map(),
  contacts: new Map(),
  links: new Map(),
  logements: new Map(),
  passages: new Map(),
  relances: new Map(),
  scenarios: new Map(),
  addrUser: new Map(), // informations saisies sur une adresse (type, signaux, étages…)
  photos: new Map(), // métadonnées seulement (le fichier image est lu à la demande)
  settings: new Map(),
  dvf: null,
};

// ---------- Abonnements (rafraîchissement des vues) ----------
const listeners = new Set();
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
let pending = new Set();
let scheduled = false;
export function emit(what) {
  pending.add(what);
  idxDirty = true;
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    const w = pending;
    pending = new Set();
    scheduled = false;
    for (const fn of listeners) {
      try {
        fn(w);
      } catch (e) {
        console.error(e);
      }
    }
  });
}

// ---------- Chargement ----------
export async function loadBase() {
  const res = await fetch('data/base.json');
  if (!res.ok) throw new Error('Données de la carte introuvables');
  const b = await res.json();
  S.base = b;
  for (const il of b.ilots) S.ilots.set(il.id, il);
  for (const a of b.adresses) {
    const [id, num, rep, v, lon, lat, ilot, parcels] = a;
    S.addrs.set(id, { id, num, rep, voie: b.voies[v], lon, lat, ilot, parcels: parcels || [], base: true });
  }
  spreadDuplicates();
}

// Les adresses au même endroit (ex. 54 et 54 bis) sont écartées de 2 à 3 m pour rester visibles et touchables.
function spreadDuplicates() {
  const groups = new Map();
  for (const a of S.addrs.values()) {
    const k = `${Math.round(a.lon * 4e4)}:${Math.round(a.lat * 6e4)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((x, y) => (+x.num || 0) - (+y.num || 0) || (x.rep || '').localeCompare(y.rep || ''));
    const r = 3.2 + g.length * 0.5; // mètres
    g.forEach((a, k) => {
      const ang = (2 * Math.PI * k) / g.length - Math.PI / 2;
      a.lat += (Math.sin(ang) * r) / 110540;
      a.lon += (Math.cos(ang) * r) / 73300;
    });
  }
}

export async function loadUserData() {
  const [contacts, links, logements, passages, relances, scenarios, addrs, photos, settings] = await Promise.all(
    ['contacts', 'links', 'logements', 'passages', 'relances', 'scenarios', 'addrs', 'photos', 'settings'].map((s) => db.getAll(s)),
  );
  fill(S.contacts, contacts);
  fill(S.links, links);
  fill(S.logements, logements);
  fill(S.passages, passages);
  fill(S.relances, relances);
  fill(S.scenarios, scenarios);
  fill(S.addrUser, addrs);
  S.photos.clear();
  for (const p of photos) S.photos.set(p.id, { id: p.id, addressId: p.addressId, createdAt: p.createdAt, w: p.w, h: p.h, type: p.type });
  fill(S.settings, settings);
  // Adresses ajoutées à la main
  for (const u of addrs) if (u.custom && !S.addrs.has(u.id)) S.addrs.set(u.id, customAddr(u));
  await purgeTrash();
  idxDirty = true;
}

function fill(map, arr) {
  map.clear();
  for (const x of arr) map.set(x.id, x);
}

function customAddr(u) {
  return { id: u.id, num: u.num || '', rep: u.rep || '', voie: u.voie || 'Adresse ajoutée', lon: u.lon, lat: u.lat, ilot: u.ilot || 0, parcels: [], base: false, custom: true };
}

// ---------- Index dérivés (reconstruits à la demande) ----------
let idxDirty = true;
let IDX = null;
export function idx() {
  if (!idxDirty && IDX) return IDX;
  const I = {
    linksByAddr: new Map(),
    linksByContact: new Map(),
    linkByLogement: new Map(),
    logementsByAddr: new Map(),
    passagesByAddr: new Map(),
    passagesByContact: new Map(),
    relancesByContact: new Map(),
  };
  const push = (m, k, v) => {
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(v);
  };
  for (const l of S.links.values()) {
    const c = S.contacts.get(l.contactId);
    if (!c || c.deletedAt) continue;
    push(I.linksByAddr, l.addressId, l);
    push(I.linksByContact, l.contactId, l);
    if (l.logementId && l.role === 'habitant') I.linkByLogement.set(l.logementId, l);
  }
  for (const lg of S.logements.values()) push(I.logementsByAddr, lg.addressId, lg);
  for (const p of S.passages.values()) {
    push(I.passagesByAddr, p.addressId, p);
    if (p.contactId) push(I.passagesByContact, p.contactId, p);
  }
  for (const arr of I.passagesByAddr.values()) arr.sort((a, b) => b.t - a.t);
  for (const arr of I.passagesByContact.values()) arr.sort((a, b) => b.t - a.t);
  for (const r of S.relances.values()) if (r.contactId) push(I.relancesByContact, r.contactId, r);
  IDX = I;
  idxDirty = false;
  return I;
}

// ---------- Lecture ----------
export const addr = (id) => S.addrs.get(id);
export const addrUser = (id) => S.addrUser.get(id) || { id };
export function addrLabel(a) {
  a = typeof a === 'string' ? S.addrs.get(a) : a;
  if (!a) return 'Adresse inconnue';
  const n = [a.num, a.rep].filter(Boolean).join(' ');
  return [n, a.voie].filter(Boolean).join(' ');
}
export function parcelOf(addressId) {
  const a = S.addrs.get(addressId);
  const i = a?.parcels?.[0];
  const p = i != null ? S.base.parcelles[i] : null;
  if (!p) return null;
  const id = p[0];
  const section = id.slice(8, 10).replace(/^0/, '');
  const num = String(parseInt(id.slice(10), 10) || '');
  return { id, cont: p[1], label: `Parcelle ${section} ${num}` };
}
export const ilotName = (id) => {
  const il = S.ilots.get(id);
  return il ? `${il.id} · ${il.nom}` : 'Hors îlot';
};

export const activeContacts = () => [...S.contacts.values()].filter((c) => !c.deletedAt);

export function contactName(c) {
  if (!c) return 'Contact supprimé';
  const n = [c.prenom, c.nom].filter((x) => x && x.trim()).join(' ');
  return n || 'Contact sans nom';
}

export function contactAddressLinks(contactId) {
  return idx().linksByContact.get(contactId) || [];
}

export function contactMainAddress(c) {
  const ls = contactAddressLinks(c.id);
  const l = ls.find((x) => x.role === 'habitant') || ls[0];
  return l ? S.addrs.get(l.addressId) : null;
}

export function contactDisplay(c) {
  const n = contactName(c);
  if (n !== 'Contact sans nom') return n;
  const a = contactMainAddress(c);
  return a ? `Contact sans nom, ${addrLabel(a)}` : n;
}

export const logementsOf = (addressId) => {
  const u = addrUser(addressId);
  const order = new Map((u.etages || []).map((e, i) => [e.id, i]));
  return (idx().logementsByAddr.get(addressId) || [])
    .slice()
    .sort((a, b) => (order.get(a.etageId) ?? 99) - (order.get(b.etageId) ?? 99) || (a.order || 0) - (b.order || 0));
};
export const contactOfLogement = (logementId) => {
  const l = idx().linkByLogement.get(logementId);
  return l ? S.contacts.get(l.contactId) : null;
};
export function linksOfAddress(addressId) {
  return idx().linksByAddr.get(addressId) || [];
}
export function habitantsOf(addressId) {
  return linksOfAddress(addressId)
    .filter((l) => !l.logementId && l.role === 'habitant')
    .map((l) => S.contacts.get(l.contactId));
}
export function proprietairesOf(addressId) {
  return linksOfAddress(addressId)
    .filter((l) => l.role === 'proprio')
    .map((l) => S.contacts.get(l.contactId));
}
export const passagesOfAddress = (addressId) => idx().passagesByAddr.get(addressId) || [];
export const passagesOfContact = (contactId) => idx().passagesByContact.get(contactId) || [];
export const passagesOfLogement = (addressId, logementId) => passagesOfAddress(addressId).filter((p) => (p.logementId || null) === (logementId || null));
export const relancesOfContact = (contactId) => (idx().relancesByContact.get(contactId) || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));

export function isImmeuble(addressId) {
  const u = addrUser(addressId);
  if (u.type === 'immeuble') return true;
  if (u.type === 'maison') return false;
  return (idx().logementsByAddr.get(addressId) || []).length > 0;
}

export function contactColor(c) {
  if (!c) return 'gris';
  if (c.nePlusSolliciter) return 'rouge';
  if (c.occupation === 'proprietaire') return 'vert';
  if (c.occupation === 'locataire') return 'orange';
  return 'gris';
}

export function logementColor(lg) {
  if (lg.color) return lg.color;
  return contactColor(contactOfLogement(lg.id));
}

const RANK = { rouge: 3, vert: 2, orange: 1, gris: 0 };
export function addressColor(addressId, ignoreOverride = false) {
  const u = addrUser(addressId);
  if (u.color && !ignoreOverride) return u.color;
  if (isImmeuble(addressId)) return 'bleu';
  let best = 'gris';
  for (const c of habitantsOf(addressId)) {
    const col = contactColor(c);
    if (RANK[col] > RANK[best]) best = col;
  }
  return best;
}
export const colorAuto = (addressId) => addressColor(addressId, true);

export const isVisited = (addressId) => passagesOfAddress(addressId).length > 0;

// Indice tiré des ventes DVF : plusieurs appartements vendus sur la parcelle = probablement un immeuble.
let aptSalesByParcel = null;
export function probableImmeuble(addressId) {
  if (addrUser(addressId).type || !S.dvf) return 0;
  if (!aptSalesByParcel) {
    aptSalesByParcel = new Map();
    for (const v of S.dvf.ventes) if (v[3] === 'Appartement' || v[3] === 'Plusieurs biens') aptSalesByParcel.set(v[12], (aptSalesByParcel.get(v[12]) || 0) + 1);
  }
  const p = parcelOf(addressId);
  const n = p ? aptSalesByParcel.get(p.id) || 0 : 0;
  return n >= 2 ? n : 0;
}
export const resetDvfHints = () => (aptSalesByParcel = null);

// Blocage « ne plus solliciter » : à l'adresse (maison), ou par appartement dans un immeuble.
export function blockedAddress(addressId) {
  const u = addrUser(addressId);
  if (u.color === 'rouge') return { by: 'adresse', date: u.colorAt };
  if (isImmeuble(addressId)) return null;
  const c = habitantsOf(addressId).find((x) => x.nePlusSolliciter);
  return c ? { by: 'contact', contact: c, date: c.nePlusDate } : null;
}
export function blockedLogement(lg) {
  if (lg.color === 'rouge') return { by: 'logement' };
  const c = contactOfLogement(lg.id);
  if (c?.nePlusSolliciter) return { by: 'contact', contact: c, date: c.nePlusDate };
  const b = addrUser(lg.addressId).color === 'rouge';
  return b ? { by: 'adresse' } : null;
}

export function interestOfAddress(addressId) {
  let best = 0;
  for (const l of linksOfAddress(addressId)) {
    const c = S.contacts.get(l.contactId);
    if (c && (c.interet || 0) > best) best = c.interet || 0;
  }
  return best;
}

export function signalsOf(addressId) {
  const u = addrUser(addressId);
  const s = (u.signals || []).map((k) => SIGNALS[k]).filter(Boolean);
  if (u.signalAutre) s.push(u.signalAutre);
  return s;
}

// Propriétaire installé depuis 7 à 10 ans : statistiquement plus enclin à vendre.
export function anneesInstalle(c) {
  const y = parseInt(c?.anneeArrivee, 10);
  if (!y) return null;
  return new Date().getFullYear() - y;
}
export function vendeurPotentiel(c) {
  if (!c || c.occupation !== 'proprietaire' || c.nePlusSolliciter) return false;
  const n = anneesInstalle(c);
  return n != null && n >= 7 && n <= 10;
}
export function hasVendeurPotentiel(addressId) {
  return linksOfAddress(addressId).some((l) => vendeurPotentiel(S.contacts.get(l.contactId)));
}

// Cibles de passage : une maison (adresse sans appartement) ou chaque appartement d'un immeuble,
// plus l'immeuble lui-même (accès, interphone).
export function lastPassage(addressId, logementId = null) {
  return passagesOfLogement(addressId, logementId)[0] || null;
}

export function absentsARepasser() {
  const out = [];
  for (const [addressId, ps] of idx().passagesByAddr) {
    const byTarget = new Map();
    for (const p of ps) {
      const k = p.logementId || '';
      if (!byTarget.has(k)) byTarget.set(k, []);
      byTarget.get(k).push(p);
    }
    for (const [k, arr] of byTarget) {
      const last = arr[0];
      if (last.result !== 'absent') continue;
      if (k) {
        const lg = S.logements.get(k);
        if (!lg || blockedLogement(lg)) continue;
      } else if (blockedAddress(addressId)) continue;
      let n = 0;
      for (const p of arr) {
        if (p.result !== 'absent') break;
        n++;
      }
      out.push({ addressId, logementId: k || null, last: last.t, count: n });
    }
  }
  return out.sort((a, b) => a.last - b.last);
}

export function relancesActives() {
  return [...S.relances.values()].filter((r) => !r.done && (!r.contactId || !S.contacts.get(r.contactId)?.deletedAt));
}

// Scénarios déjà présentés à une personne (et à une adresse).
export function scenariosPresentes(contactId) {
  const m = new Map();
  for (const p of passagesOfContact(contactId)) if (p.scenarioId && p.result === 'contact' && !m.has(p.scenarioId)) m.set(p.scenarioId, p.t);
  return m;
}
export function scenariosPresentesAdresse(addressId) {
  const m = new Map();
  for (const p of passagesOfAddress(addressId)) if (p.scenarioId && p.result === 'contact' && !m.has(p.scenarioId)) m.set(p.scenarioId, p.t);
  return m;
}
export const activeScenarios = () =>
  [...S.scenarios.values()].filter((s) => !s.deletedAt).sort((a, b) => (a.titre || '').localeCompare(b.titre || '', 'fr'));

// ---------- RGPD ----------
// Coordonnées gardées sans accord noté (hors personnes qui ne veulent plus être sollicitées).
export const hasCoords = (c) => !!((c?.tel || '').trim() || (c?.email || '').trim());
export const accordManquant = (c) => !!c && !c.deletedAt && !c.nePlusSolliciter && hasCoords(c) && !c.accord;
export const contactsSansAccord = () => activeContacts().filter(accordManquant);

// Règle des 3 ans : un prospect se garde au plus 3 ans après le dernier échange avec lui.
export const RETENTION_ANS = 3;
const RETENTION_MS = RETENTION_ANS * 365.25 * 86400000;
export function dernierEchange(c) {
  let t = c.createdAt || 0;
  for (const p of passagesOfContact(c.id)) if (p.result !== 'absent' && p.t > t) t = p.t;
  for (const d of [c.accordDate, c.nePlusDate, c.mandatDate]) if (d) t = Math.max(t, dayMs(d));
  for (const r of relancesOfContact(c.id)) if (r.done && r.doneAt > t) t = r.doneAt;
  return t;
}
export function aNettoyer(now = Date.now()) {
  const limit = now - RETENTION_MS;
  return {
    limit,
    contacts: activeContacts()
      .filter((c) => !c.mandatSigne && dernierEchange(c) < limit)
      .sort((a, b) => dernierEchange(a) - dernierEchange(b)),
    passages: [...S.passages.values()].filter((p) => p.t < limit),
  };
}
// Suppression définitive (contacts + leurs liens et relances, vieux passages), en une seule écriture.
export async function nettoyer({ contacts, passages }) {
  const ops = [];
  const gone = new Set(contacts.map((c) => c.id));
  for (const id of gone) {
    S.contacts.delete(id);
    ops.push({ store: 'contacts', type: 'del', id });
  }
  for (const l of [...S.links.values()])
    if (gone.has(l.contactId)) {
      S.links.delete(l.id);
      ops.push({ store: 'links', type: 'del', id: l.id });
    }
  for (const r of [...S.relances.values()])
    if (gone.has(r.contactId)) {
      S.relances.delete(r.id);
      ops.push({ store: 'relances', type: 'del', id: r.id });
    }
  const oldIds = new Set(passages.map((p) => p.id));
  for (const id of oldIds) {
    S.passages.delete(id);
    ops.push({ store: 'passages', type: 'del', id });
  }
  // Passages plus récents qui mentionnaient une personne supprimée : on retire juste le lien.
  for (const p of S.passages.values())
    if (p.contactId && gone.has(p.contactId)) {
      p.contactId = null;
      ops.push({ store: 'passages', type: 'put', value: p });
    }
  await db.batch(ops);
  emit('contacts');
  emit('passages');
  return { contacts: gone.size, passages: oldIds.size };
}

// ---------- Recherche ----------
export function searchContacts(q) {
  const nq = norm(q);
  const dq = phoneKey(q);
  const all = activeContacts();
  if (!nq) return all;
  const terms = nq.split(' ');
  return all.filter((c) => {
    const addrs = contactAddressLinks(c.id)
      .map((l) => addrLabel(l.addressId))
      .join(' ');
    const hay = norm([c.prenom, c.nom, c.email, addrs, (c.tags || []).join(' ')].join(' '));
    if (dq.length >= 4 && phoneKey(c.tel).includes(dq)) return true;
    return terms.every((t) => hay.includes(t));
  });
}

let addrSearchIndex = null;
export function searchAddresses(q, limit = 30) {
  const nq = norm(q);
  if (!nq) return [];
  if (!addrSearchIndex || addrSearchIndex.size !== S.addrs.size) {
    addrSearchIndex = new Map();
    for (const a of S.addrs.values()) addrSearchIndex.set(a.id, norm(addrLabel(a)));
  }
  const terms = nq.split(' ');
  const out = [];
  for (const [id, hay] of addrSearchIndex) {
    if (terms.every((t) => hay.includes(t))) {
      out.push(S.addrs.get(id));
      if (out.length >= limit * 4) break;
    }
  }
  // Les numéros exacts d'abord
  const num = terms.find((t) => /^\d+$/.test(t));
  out.sort((a, b) => (num ? (a.num === num ? 0 : 1) - (b.num === num ? 0 : 1) : 0) || addrLabel(a).localeCompare(addrLabel(b), 'fr', { numeric: true }));
  return out.slice(0, limit);
}

export function findDuplicates(c) {
  const out = [];
  const pk = phoneKey(c.tel);
  const nk = norm(`${c.prenom || ''} ${c.nom || ''}`);
  const hasName = (c.prenom || '').trim() && (c.nom || '').trim();
  for (const o of activeContacts()) {
    if (o.id === c.id) continue;
    if (pk.length >= 8 && phoneKey(o.tel) === pk) out.push({ contact: o, why: 'même numéro de téléphone' });
    else if (hasName && norm(`${o.prenom || ''} ${o.nom || ''}`) === nk) out.push({ contact: o, why: 'même nom' });
  }
  return out;
}

// ---------- Écriture ----------
const now = () => Date.now();

export async function saveContact(c) {
  const isNew = !S.contacts.has(c.id);
  c.id = c.id || uid();
  if (isNew) c.createdAt = c.createdAt || now();
  c.updatedAt = now();
  S.contacts.set(c.id, c);
  await db.put('contacts', c);
  emit('contacts');
  return c;
}

export function newContact(extra = {}) {
  return { id: uid(), prenom: '', nom: '', tel: '', email: '', occupation: null, interet: 0, tags: [], createdAt: now(), ...extra };
}

export async function trashContact(id) {
  const c = S.contacts.get(id);
  if (!c) return;
  c.deletedAt = now();
  await saveContact(c);
}
export async function restoreContact(id) {
  const c = S.contacts.get(id);
  if (!c) return;
  c.deletedAt = null;
  await saveContact(c);
}
export async function purgeContact(id) {
  const ops = [{ store: 'contacts', type: 'del', id }];
  S.contacts.delete(id);
  for (const l of [...S.links.values()])
    if (l.contactId === id) {
      S.links.delete(l.id);
      ops.push({ store: 'links', type: 'del', id: l.id });
    }
  for (const r of [...S.relances.values()])
    if (r.contactId === id) {
      S.relances.delete(r.id);
      ops.push({ store: 'relances', type: 'del', id: r.id });
    }
  await db.batch(ops);
  emit('contacts');
}

export async function saveLink(l) {
  l.id = l.id || uid();
  S.links.set(l.id, l);
  await db.put('links', l);
  emit('links');
  return l;
}
export async function deleteLink(id) {
  S.links.delete(id);
  await db.del('links', id);
  emit('links');
}
export async function setContactLinks(contactId, links) {
  // Remplace les liens d'un contact par la liste donnée (hors liens d'appartement gérés par la vue immeuble).
  const ops = [];
  for (const l of [...S.links.values()])
    if (l.contactId === contactId && !l.logementId && !links.some((x) => x.id === l.id)) {
      S.links.delete(l.id);
      ops.push({ store: 'links', type: 'del', id: l.id });
    }
  for (const l of links) {
    l.id = l.id || uid();
    l.contactId = contactId;
    S.links.set(l.id, l);
    ops.push({ store: 'links', type: 'put', value: l });
  }
  await db.batch(ops);
  emit('links');
}

export async function saveAddrUser(u) {
  u.updatedAt = now();
  S.addrUser.set(u.id, u);
  if (u.custom) S.addrs.set(u.id, customAddr(u));
  await db.put('addrs', u);
  emit('addrs');
  return u;
}

export async function deleteCustomAddress(id) {
  await db.del('addrs', id);
  S.addrUser.delete(id);
  S.addrs.delete(id);
  emit('addrs');
}

export async function addPassage(p) {
  p.id = p.id || uid();
  p.t = p.t || now();
  S.passages.set(p.id, p);
  await db.put('passages', p);
  emit('passages');
  return p;
}
export async function deletePassage(id) {
  S.passages.delete(id);
  await db.del('passages', id);
  emit('passages');
}

export async function saveRelance(r) {
  r.id = r.id || uid();
  r.createdAt = r.createdAt || now();
  S.relances.set(r.id, r);
  await db.put('relances', r);
  emit('relances');
  return r;
}
export async function deleteRelance(id) {
  S.relances.delete(id);
  await db.del('relances', id);
  emit('relances');
}

export async function saveScenario(s) {
  s.id = s.id || uid();
  s.createdAt = s.createdAt || now();
  s.updatedAt = now();
  S.scenarios.set(s.id, s);
  await db.put('scenarios', s);
  emit('scenarios');
  return s;
}
export async function purgeScenario(id) {
  S.scenarios.delete(id);
  await db.del('scenarios', id);
  emit('scenarios');
}

// Enregistrement groupé de la vue immeuble (brouillon validé).
export async function saveBuilding(addressId, draft) {
  // Copie : le brouillon de la vue immeuble reste indépendant de l'état enregistré.
  const { user, logements, deletedLogementIds, links, deletedLinkIds } = structuredClone(draft);
  const ops = [];
  user.updatedAt = now();
  S.addrUser.set(addressId, user);
  ops.push({ store: 'addrs', type: 'put', value: user });
  for (const id of deletedLogementIds) {
    S.logements.delete(id);
    ops.push({ store: 'logements', type: 'del', id });
  }
  for (const lg of logements) {
    delete lg._seen;
    lg.updatedAt = now();
    S.logements.set(lg.id, lg);
    ops.push({ store: 'logements', type: 'put', value: lg });
  }
  for (const id of deletedLinkIds) {
    S.links.delete(id);
    ops.push({ store: 'links', type: 'del', id });
  }
  for (const l of links) {
    S.links.set(l.id, l);
    ops.push({ store: 'links', type: 'put', value: l });
  }
  await db.batch(ops);
  emit('building');
}

export async function setSetting(key, value) {
  const o = { id: key, value };
  S.settings.set(key, o);
  await db.put('settings', o);
  emit('settings');
}
export const getSetting = (key, def = null) => (S.settings.has(key) ? S.settings.get(key).value : def);

// Corbeille : suppression définitive au-delà de 30 jours.
export async function purgeTrash() {
  const limit = Date.now() - 30 * 86400000;
  for (const c of [...S.contacts.values()]) if (c.deletedAt && c.deletedAt < limit) await purgeContact(c.id);
  for (const s of [...S.scenarios.values()]) if (s.deletedAt && s.deletedAt < limit) await purgeScenario(s.id);
}

export function relanceStatus(r) {
  const t = todayStr();
  if (r.done) return 'faite';
  if (r.date < t) return 'retard';
  if (r.date === t) return 'jour';
  return 'avenir';
}
export const isToday = (ms) => startOfDay(ms) === startOfDay();
export const dayMs = (s) => parseDay(s).getTime();
