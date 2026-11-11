// Stockage local (IndexedDB). Toutes les données de l'utilisateur restent sur l'appareil.

const DB_NAME = 'prospection';
const DB_VERSION = 1;
export const STORES = ['contacts', 'links', 'logements', 'passages', 'relances', 'scenarios', 'addrs', 'photos', 'settings'];

let dbp = null;

export function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Base de données bloquée par un autre onglet'));
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

export async function getAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function get(store, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function put(store, obj) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(obj);
  return done(tx);
}

export async function del(store, id) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(id);
  return done(tx);
}

// Plusieurs écritures et suppressions en une seule transaction (tout ou rien).
export async function batch(ops) {
  if (!ops.length) return;
  const db = await openDB();
  const stores = [...new Set(ops.map((o) => o.store))];
  const tx = db.transaction(stores, 'readwrite');
  for (const o of ops) {
    const st = tx.objectStore(o.store);
    if (o.type === 'del') st.delete(o.id);
    else st.put(o.value);
  }
  return done(tx);
}

// Remplace tout le contenu (restauration d'une sauvegarde).
export async function replaceAll(data) {
  const db = await openDB();
  const tx = db.transaction(STORES, 'readwrite');
  for (const s of STORES) {
    const st = tx.objectStore(s);
    st.clear();
    for (const v of data[s] || []) st.put(v);
  }
  return done(tx);
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
