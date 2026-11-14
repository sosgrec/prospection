// Chiffrement des données sur le téléphone.
// Le code à 6 chiffres donne une clé (PBKDF2, 600 000 tours) qui protège un secret aléatoire.
// Ce secret chiffre chaque enregistrement (AES-GCM 256 bits) et masque les identifiants (HMAC-SHA256).
const subtle = globalThis.crypto.subtle;
const te = new TextEncoder();
const td = new TextDecoder();

export const PIN_LENGTH = 6;
const ITERATIONS = 600000;

let aesKey = null;
let macKey = null;
const sidCache = new Map();

export const isReady = () => !!aesKey;

const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
const u8 = (x) => (x instanceof Uint8Array ? x : new Uint8Array(x));

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Codes trop faciles à deviner : chiffres identiques, suites, motifs répétés.
export function codeTropSimple(pin) {
  if (!/^\d{6}$/.test(pin)) return true;
  if (/^(\d)\1{5}$/.test(pin)) return true;
  const d = [...pin].map(Number);
  const steps = d.slice(1).map((x, i) => x - d[i]);
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return true;
  if (pin.slice(0, 2).repeat(3) === pin || pin.slice(0, 3).repeat(2) === pin) return true;
  return false;
}

async function keyFromPin(pin, salt, iterations) {
  const base = await subtle.importKey('raw', te.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function useSecret(secret) {
  aesKey = await subtle.importKey('raw', secret.slice(0, 32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  macKey = await subtle.importKey('raw', secret.slice(32, 64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  sidCache.clear();
}

async function wrapSecret(pin, secret) {
  const salt = rand(16);
  const iv = rand(12);
  const key = await keyFromPin(pin, salt, ITERATIONS);
  const wrapped = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, secret));
  return { salt, iter: ITERATIONS, iv, wrapped };
}

async function unwrapSecret(pin, vault) {
  const key = await keyFromPin(pin, u8(vault.salt), vault.iter);
  try {
    return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: u8(vault.iv) }, key, u8(vault.wrapped)));
  } catch {
    return null; // code faux
  }
}

// Création du coffre : nouveau secret aléatoire, protégé par le code.
export async function createVault(pin) {
  const secret = rand(64);
  const w = await wrapSecret(pin, secret);
  await useSecret(secret);
  secret.fill(0);
  return { id: 'main', v: 1, ...w, createdAt: Date.now(), fails: 0, nextTry: 0 };
}

// Ouvre le coffre si le code est bon.
export async function unlock(pin, vault) {
  const secret = await unwrapSecret(pin, vault);
  if (!secret) return false;
  await useSecret(secret);
  secret.fill(0);
  return true;
}

// Vérifie le code sans rien changer.
export async function verify(pin, vault) {
  const secret = await unwrapSecret(pin, vault);
  if (!secret) return false;
  secret.fill(0);
  return true;
}

// Nouveau code : le même secret est protégé par le nouveau code.
export async function changePin(oldPin, newPin, vault) {
  const secret = await unwrapSecret(oldPin, vault);
  if (!secret) return null;
  const w = await wrapSecret(newPin, secret);
  secret.fill(0);
  return { ...vault, ...w, changedAt: Date.now(), fails: 0, nextTry: 0 };
}

// Identifiant masqué d'un enregistrement (clé IndexedDB).
export async function sid(store, id) {
  const k = `${store}\u0000${id}`;
  let s = sidCache.get(k);
  if (s) return s;
  if (!macKey) throw new Error('Appli verrouillée');
  s = b64url(new Uint8Array(await subtle.sign('HMAC', macKey, te.encode(k))).subarray(0, 16));
  sidCache.set(k, s);
  return s;
}

// Enregistrement chiffré : { id: identifiant masqué, e: IV (12 octets) + données chiffrées }.
// Un champ `bytes` (Uint8Array) est gardé tel quel, sans passer par JSON (photos).
export async function seal(store, obj) {
  if (!aesKey) throw new Error('Appli verrouillée');
  let plain;
  if (obj.bytes instanceof Uint8Array) {
    const { bytes, ...meta } = obj;
    const m = te.encode(JSON.stringify(meta));
    plain = new Uint8Array(5 + m.length + bytes.length);
    plain[0] = 2;
    new DataView(plain.buffer).setUint32(1, m.length, true);
    plain.set(m, 5);
    plain.set(bytes, 5 + m.length);
  } else {
    const m = te.encode(JSON.stringify(obj));
    plain = new Uint8Array(1 + m.length);
    plain[0] = 1;
    plain.set(m, 1);
  }
  const iv = rand(12);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(store) }, aesKey, plain));
  const e = new Uint8Array(12 + ct.length);
  e.set(iv);
  e.set(ct, 12);
  return { id: await sid(store, obj.id), e };
}

export async function open(store, rec) {
  if (!rec || rec.e === undefined) return rec;
  if (!aesKey) throw new Error('Appli verrouillée');
  const e = u8(rec.e);
  const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: e.subarray(0, 12), additionalData: te.encode(store) }, aesKey, e.subarray(12)));
  if (plain[0] === 2) {
    const n = new DataView(plain.buffer, plain.byteOffset).getUint32(1, true);
    const meta = JSON.parse(td.decode(plain.subarray(5, 5 + n)));
    meta.bytes = plain.slice(5 + n);
    return meta;
  }
  return JSON.parse(td.decode(plain.subarray(1)));
}

export const isSealed = (rec) => !!rec && rec.e !== undefined;
