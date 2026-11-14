// Stockage local (IndexedDB). Toutes les données de l'utilisateur restent sur l'appareil,
// chiffrées par vault.js : chaque enregistrement est illisible sans le code.
import * as vault from './vault.js';

const DB_NAME = 'prospection';
const DB_VERSION = 2;
// Magasins chiffrés. 'photos' ne garde que la description d'une photo, l'image est dans 'photoData'.
export const STORES = ['contacts', 'links', 'logements', 'passages', 'relances', 'scenarios', 'addrs', 'photos', 'photoData', 'settings'];
const VAULT = 'vault'; // paramètres du chiffrement (sel, secret protégé par le code), non secrets

let dbp = null;

export function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of [...STORES, VAULT]) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Base de données bloquée : ferme les autres fenêtres de l’appli'));
  });
  return dbp;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction annulée'));
  });
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function rawAll(store) {
  const db = await openDB();
  return (await reqP(db.transaction(store).objectStore(store).getAll())) || [];
}

// Enregistrements illisibles (ne devrait jamais arriver) : ignorés plutôt que de bloquer l'appli.
export let unreadable = 0;

export async function getAll(store) {
  const raw = await rawAll(store);
  const out = await Promise.all(
    raw.map((r) =>
      vault.open(store, r).catch((e) => {
        unreadable++;
        console.error('Enregistrement illisible', store, e);
        return null;
      }),
    ),
  );
  return out.filter(Boolean);
}

export async function get(store, id) {
  const db = await openDB();
  const key = await vault.sid(store, id);
  const r = await reqP(db.transaction(store).objectStore(store).get(key));
  return r ? vault.open(store, r) : undefined;
}

// Le chiffrement se fait AVANT d'ouvrir la transaction (une transaction IndexedDB se ferme si on attend autre chose).
export async function put(store, obj) {
  const rec = await vault.seal(store, obj);
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(rec);
  return done(tx);
}

export async function del(store, id) {
  const key = await vault.sid(store, id);
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return done(tx);
}

// Plusieurs écritures et suppressions en une seule transaction (tout ou rien).
export async function batch(ops) {
  if (!ops.length) return;
  const ready = await Promise.all(ops.map(async (o) => (o.type === 'del' ? { store: o.store, del: await vault.sid(o.store, o.id) } : { store: o.store, rec: await vault.seal(o.store, o.value) })));
  const db = await openDB();
  const stores = [...new Set(ops.map((o) => o.store))];
  const tx = db.transaction(stores, 'readwrite');
  for (const o of ready) {
    const st = tx.objectStore(o.store);
    if (o.del !== undefined) st.delete(o.del);
    else st.put(o.rec);
  }
  return done(tx);
}

// Remplace tout le contenu (restauration d'une sauvegarde).
export async function replaceAll(data) {
  const sealed = {};
  for (const s of STORES) sealed[s] = await Promise.all((data[s] || []).map((v) => vault.seal(s, v)));
  const db = await openDB();
  const tx = db.transaction(STORES, 'readwrite');
  for (const s of STORES) {
    const st = tx.objectStore(s);
    st.clear();
    for (const v of sealed[s]) st.put(v);
  }
  return done(tx);
}

// ---------- Coffre (code) ----------
export async function getVault() {
  const db = await openDB();
  return reqP(db.transaction(VAULT).objectStore(VAULT).get('main'));
}

export async function putVault(v) {
  const db = await openDB();
  const tx = db.transaction(VAULT, 'readwrite');
  tx.objectStore(VAULT).put(v);
  return done(tx);
}

// Données enregistrées avant le chiffrement (version précédente de l'appli) ?
export async function hasPlainData() {
  const db = await openDB();
  for (const s of STORES) {
    const n = await reqP(db.transaction(s).objectStore(s).count());
    if (n) return true;
  }
  return false;
}

// Première mise en place du code : chiffre les données existantes et enregistre le coffre,
// en une seule transaction. Si quelque chose échoue, rien n'est modifié.
export async function encryptExisting(vaultRec, onProgress = () => {}) {
  const plain = {};
  for (const s of STORES) plain[s] = (await rawAll(s)).filter((r) => !vault.isSealed(r));
  // Les anciennes photos gardaient l'image (Blob) dans 'photos' : on la déplace dans 'photoData'.
  const photoData = [];
  let lostPhotos = 0;
  const metas = [];
  for (const p of plain.photos) {
    const { blob, ...meta } = p;
    if (blob) {
      try {
        photoData.push({ id: p.id, type: blob.type || 'image/jpeg', bytes: new Uint8Array(await blob.arrayBuffer()) });
      } catch (e) {
        console.error('Photo illisible', e);
        lostPhotos++;
        continue;
      }
    }
    metas.push(meta);
  }
  plain.photos = metas;
  plain.photoData = [...plain.photoData, ...photoData];
  const total = STORES.reduce((n, s) => n + plain[s].length, 0);
  onProgress(0, total);
  const sealed = {};
  let k = 0;
  for (const s of STORES) {
    sealed[s] = [];
    for (const v of plain[s]) {
      sealed[s].push(await vault.seal(s, v));
      if (++k % 200 === 0) onProgress(k, total);
    }
  }
  const db = await openDB();
  const tx = db.transaction([...STORES, VAULT], 'readwrite');
  for (const s of STORES) {
    const st = tx.objectStore(s);
    st.clear();
    for (const v of sealed[s]) st.put(v);
  }
  tx.objectStore(VAULT).put(vaultRec);
  await done(tx);
  return { total, lostPhotos };
}

// Code oublié : efface toute la base de l'appli sur ce téléphone.
export async function wipe() {
  try {
    (await dbp)?.close();
  } catch {
    /* rien */
  }
  dbp = null;
  await new Promise((resolve, reject) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
    r.onblocked = () => resolve();
  });
}

export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function storageInfo() {
  try {
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
    const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    return { persisted, usage: est?.usage ?? null, quota: est?.quota ?? null };
  } catch {
    return { persisted: null, usage: null, quota: null };
  }
}
