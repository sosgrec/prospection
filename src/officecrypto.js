// Fichier Excel protégé par mot de passe, au format standard d'Office (chiffrement « Agile » :
// AES-256, SHA-512, 100 000 tours). Excel l'ouvre après saisie du mot de passe.
// Spécification : MS-OFFCRYPTO (Microsoft), sections 2.3.4.10 à 2.3.4.15.
import { sha512, sha384, sha256 } from '@noble/hashes/sha2.js';
import { sha1 } from '@noble/hashes/legacy.js';

const subtle = globalThis.crypto.subtle;
const te = new TextEncoder();
const SEGMENT = 4096;
const BLK = {
  verifierInput: [0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79],
  verifierValue: [0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e],
  keyValue: [0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6],
  hmacKey: [0x5f, 0xb2, 0xad, 0x01, 0x0c, 0xb9, 0xe1, 0xf6],
  hmacValue: [0xa0, 0x67, 0x7f, 0x02, 0xb2, 0x2c, 0x84, 0x33],
};
const HASH = { SHA512: sha512, SHA384: sha384, SHA256: sha256, SHA1: sha1 };
const WEB_HASH = { SHA512: 'SHA-512', SHA384: 'SHA-384', SHA256: 'SHA-256', SHA1: 'SHA-1' };

export class OfficeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ---------- Outils ----------
function concat(...parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
const u32le = (i) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, i, true);
  return b;
};
function utf16le(s) {
  const b = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    b[2 * i] = c & 255;
    b[2 * i + 1] = c >> 8;
  }
  return b;
}
// Coupe ou complète un tableau d'octets à la taille n.
function fit(buf, n, fill) {
  if (buf.length >= n) return buf.slice(0, n);
  const out = new Uint8Array(n).fill(fill);
  out.set(buf);
  return out;
}
const roundUp = (n, k) => Math.ceil(n / k) * k;
const equal = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const b64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// Hachage itéré du mot de passe : H0 = H(sel + mot de passe), puis H(i + Hn) pendant `spin` tours.
export function iteratedHash(password, salt, spin, H = sha512) {
  let h = H(concat(salt, utf16le(password)));
  const buf = new Uint8Array(4 + h.length);
  const dv = new DataView(buf.buffer);
  for (let i = 0; i < spin; i++) {
    dv.setUint32(0, i, true);
    buf.set(h, 4);
    h = H(buf);
  }
  return h;
}
const blockKey = (h, blk, bytes, H) => fit(H(concat(h, Uint8Array.from(blk))), bytes, 0x36);
const ivOf = (salt, blk, blockSize, H) => fit(blk ? H(concat(salt, Uint8Array.from(blk))) : salt, blockSize, 0x36);

// AES-CBC sans bourrage (WebCrypto en ajoute toujours un : on le retire ou on le simule).
const aesKey = (raw) => subtle.importKey('raw', raw, 'AES-CBC', false, ['encrypt', 'decrypt']);
async function cbcEncrypt(key, iv, data) {
  const out = new Uint8Array(await subtle.encrypt({ name: 'AES-CBC', iv }, key, data));
  return out.subarray(0, data.length);
}
async function cbcDecrypt(key, iv, data) {
  if (!data.length || data.length % 16) throw new OfficeError('abime', 'Fichier abîmé (taille des données chiffrées).');
  const last = data.subarray(data.length - 16);
  const extra = new Uint8Array(await subtle.encrypt({ name: 'AES-CBC', iv: last }, key, new Uint8Array(16).fill(16))).subarray(0, 16);
  return new Uint8Array(await subtle.decrypt({ name: 'AES-CBC', iv }, key, concat(data, extra)));
}

async function inBatches(n, size, fn) {
  for (let i = 0; i < n; i += size) {
    const jobs = [];
    for (let k = i; k < Math.min(n, i + size); k++) jobs.push(fn(k));
    await Promise.all(jobs);
  }
}

// ---------- Chiffrement ----------
export async function encryptOffice(plain, password, { spinCount = 100000, now = Date.now(), random = (n) => crypto.getRandomValues(new Uint8Array(n)) } = {}) {
  if (!password) throw new OfficeError('mdp', 'Mot de passe vide.');
  const H = sha512;
  const pwSalt = random(16);
  const keySalt = random(16);
  const secret = random(32);
  const verifier = random(16);
  const hmacSalt = random(64);

  const h = iteratedHash(password, pwSalt, spinCount, H);
  const [k1, k2, k3] = await Promise.all([BLK.verifierInput, BLK.verifierValue, BLK.keyValue].map((b) => aesKey(blockKey(h, b, 32, H))));
  const encVerifierInput = await cbcEncrypt(k1, pwSalt, verifier);
  const encVerifierValue = await cbcEncrypt(k2, pwSalt, H(verifier));
  const encKeyValue = await cbcEncrypt(k3, pwSalt, secret);

  // Paquet chiffré : taille d'origine (8 octets) puis blocs de 4096 octets chiffrés séparément.
  const sk = await aesKey(secret);
  const nSeg = Math.ceil(plain.length / SEGMENT);
  const lastLen = plain.length - (nSeg - 1) * SEGMENT;
  const pkg = new Uint8Array(8 + (nSeg - 1) * SEGMENT + roundUp(lastLen, 16));
  const dv = new DataView(pkg.buffer);
  dv.setUint32(0, plain.length >>> 0, true);
  dv.setUint32(4, Math.floor(plain.length / 2 ** 32), true);
  await inBatches(nSeg, 64, async (i) => {
    const seg = plain.subarray(i * SEGMENT, Math.min(plain.length, (i + 1) * SEGMENT));
    const iv = fit(H(concat(keySalt, u32le(i))), 16, 0x36);
    pkg.set(await cbcEncrypt(sk, iv, seg.length % 16 ? fit(seg, roundUp(seg.length, 16), 0) : seg), 8 + i * SEGMENT);
  });

  // Intégrité : HMAC-SHA512 de tout le paquet chiffré.
  const encHmacKey = await cbcEncrypt(sk, ivOf(keySalt, BLK.hmacKey, 16, H), hmacSalt);
  const hk = await subtle.importKey('raw', hmacSalt, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const mac = new Uint8Array(await subtle.sign('HMAC', hk, pkg));
  const encHmacValue = await cbcEncrypt(sk, ivOf(keySalt, BLK.hmacValue, 16, H), mac);

  const common = 'saltSize="16" blockSize="16" keyBits="256" hashSize="64" cipherAlgorithm="AES" cipherChaining="ChainingModeCBC" hashAlgorithm="SHA512"';
  const xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
    '<encryption xmlns="http://schemas.microsoft.com/office/2006/encryption" xmlns:p="http://schemas.microsoft.com/office/2006/keyEncryptor/password" xmlns:c="http://schemas.microsoft.com/office/2006/keyEncryptor/certificate">' +
    `<keyData ${common} saltValue="${b64(keySalt)}"/>` +
    `<dataIntegrity encryptedHmacKey="${b64(encHmacKey)}" encryptedHmacValue="${b64(encHmacValue)}"/>` +
    '<keyEncryptors><keyEncryptor uri="http://schemas.microsoft.com/office/2006/keyEncryptor/password">' +
    `<p:encryptedKey spinCount="${spinCount}" ${common} saltValue="${b64(pwSalt)}" encryptedVerifierHashInput="${b64(encVerifierInput)}" encryptedVerifierHashValue="${b64(encVerifierValue)}" encryptedKeyValue="${b64(encKeyValue)}"/>` +
    '</keyEncryptor></keyEncryptors></encryption>';
  const info = concat(Uint8Array.from([4, 0, 4, 0, 0x40, 0, 0, 0]), te.encode(xml));
  return writeCfb(pkg, info, now);
}

// ---------- Déchiffrement ----------
export const isOfficeEncrypted = (b) => b.length > 512 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 && b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1;

function attrs(tag) {
  const o = {};
  for (const m of tag.matchAll(/([\w:]+)="([^"]*)"/g)) o[m[1].replace(/^\w+:/, '')] = m[2];
  return o;
}

export function parseEncryptionInfo(info) {
  const major = info[0] | (info[1] << 8);
  const minor = info[2] | (info[3] << 8);
  if (major !== 4 || minor !== 4) throw new OfficeError('format', 'Ce fichier est protégé par un ancien format d’Excel. Ouvre-le dans Excel et enregistre-le à nouveau avec un mot de passe, puis réessaie.');
  const xml = new TextDecoder().decode(info.subarray(8));
  const kd = xml.match(/<(?:\w+:)?keyData\b([^>]*)>/);
  const di = xml.match(/<(?:\w+:)?dataIntegrity\b([^>]*)>/);
  const ek = xml.match(/keyEncryptor\/password"[^>]*>\s*<(?:\w+:)?encryptedKey\b([^>]*)>/);
  if (!kd || !ek) throw new OfficeError('format', 'Protection de fichier non reconnue (seule la protection par mot de passe est prise en charge).');
  return { keyData: attrs(kd[1]), integrity: di ? attrs(di[1]) : null, key: attrs(ek[1]) };
}

export async function decryptOffice(fileBytes, password) {
  const CFB = (await import('cfb')).default;
  let cfb;
  try {
    cfb = CFB.read(fileBytes, { type: 'array' });
  } catch {
    throw new OfficeError('format', 'Fichier illisible.');
  }
  const infoEntry = CFB.find(cfb, 'EncryptionInfo');
  const pkgEntry = CFB.find(cfb, 'EncryptedPackage');
  if (!infoEntry?.content || !pkgEntry?.content) throw new OfficeError('format', 'Ce fichier n’est pas un fichier Excel protégé par mot de passe.');
  const { keyData: kd, integrity, key } = parseEncryptionInfo(Uint8Array.from(infoEntry.content));
  const pkg = Uint8Array.from(pkgEntry.content);
  for (const p of [kd, key]) {
    if (p.cipherAlgorithm !== 'AES' || p.cipherChaining !== 'ChainingModeCBC' || !HASH[p.hashAlgorithm]) throw new OfficeError('format', `Chiffrement non pris en charge (${p.cipherAlgorithm} ${p.cipherChaining} ${p.hashAlgorithm}).`);
  }

  // Vérification du mot de passe
  const H = HASH[key.hashAlgorithm];
  const salt = unb64(key.saltValue);
  const keyBytes = +key.keyBits / 8;
  const iv = fit(salt, +key.blockSize, 0x36);
  const h = iteratedHash(password, salt, +key.spinCount, H);
  const [k1, k2, k3] = await Promise.all([BLK.verifierInput, BLK.verifierValue, BLK.keyValue].map((b) => aesKey(blockKey(h, b, keyBytes, H))));
  const vin = await cbcDecrypt(k1, iv, unb64(key.encryptedVerifierHashInput));
  const vval = await cbcDecrypt(k2, iv, unb64(key.encryptedVerifierHashValue));
  if (!equal(H(vin.subarray(0, +key.saltSize)), vval.subarray(0, +key.hashSize))) throw new OfficeError('mdp', 'Mot de passe incorrect.');
  const secret = (await cbcDecrypt(k3, iv, unb64(key.encryptedKeyValue))).subarray(0, +kd.keyBits / 8);
  const sk = await aesKey(secret);

  // Intégrité (signalée, sans bloquer : le contenu est de toute façon vérifié ensuite)
  const KH = HASH[kd.hashAlgorithm];
  const kdSalt = unb64(kd.saltValue);
  let intact = null;
  if (integrity?.encryptedHmacKey) {
    try {
      const hmKey = (await cbcDecrypt(sk, ivOf(kdSalt, BLK.hmacKey, +kd.blockSize, KH), unb64(integrity.encryptedHmacKey))).subarray(0, +kd.hashSize);
      const hmVal = (await cbcDecrypt(sk, ivOf(kdSalt, BLK.hmacValue, +kd.blockSize, KH), unb64(integrity.encryptedHmacValue))).subarray(0, +kd.hashSize);
      const hk = await subtle.importKey('raw', hmKey, { name: 'HMAC', hash: WEB_HASH[kd.hashAlgorithm] }, false, ['sign']);
      intact = equal(new Uint8Array(await subtle.sign('HMAC', hk, pkg)), hmVal);
    } catch {
      intact = false;
    }
  }

  const dv = new DataView(pkg.buffer, pkg.byteOffset);
  const size = dv.getUint32(0, true) + dv.getUint32(4, true) * 2 ** 32;
  const data = pkg.subarray(8);
  const nSeg = Math.ceil(data.length / SEGMENT);
  const out = new Uint8Array(data.length);
  await inBatches(nSeg, 64, async (i) => {
    const seg = data.subarray(i * SEGMENT, Math.min(data.length, (i + 1) * SEGMENT));
    const segIv = fit(KH(concat(kdSalt, u32le(i))), +kd.blockSize, 0x36);
    out.set(await cbcDecrypt(sk, segIv, seg), i * SEGMENT);
  });
  return { bytes: out.subarray(0, Math.min(size, out.length)), intact };
}

// ---------- Conteneur « Compound File » (même structure que les fichiers protégés d'Office) ----------
const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;
const FATSECT = 0xfffffffd;
const DIFSECT = 0xfffffffc;
const hex = (s) => Uint8Array.from(s.match(/../g), (x) => parseInt(x, 16));
// Flux de description de l'espace de données chiffré (contenu fixe, défini par la spécification MS-OFFCRYPTO).
const DS_VERSION = hex('3c0000004d006900630072006f0073006f00660074002e0043006f006e007400610069006e00650072002e004400610074006100530070006100630065007300010000000100000001000000');
const DS_MAP = hex(
  '08000000010000006800000001000000000000002000000045006e0063007200790070007400650064005000610063006b00610067006500320000005300740072006f006e00670045006e006300720079007000740069006f006e004400610074006100530070006100630065000000',
);
const DS_STRONG = hex('0800000001000000320000005300740072006f006e00670045006e006300720079007000740069006f006e005400720061006e00730066006f0072006d000000');
const DS_PRIMARY = hex(
  '58000000010000004c0000007b00460046003900410033004600300033002d0035003600450046002d0034003600310033002d0042004400440035002d003500410034003100430031004400300037003200340036007d004e0000004d006900630072006f0073006f00660074002e0043006f006e007400610069006e00650072002e0045006e006300720079007000740069006f006e005400720061006e00730066006f0072006d00000001000000010000000100000000000000000000000000000004000000',
);

export function writeCfb(pkg, info, now = Date.now()) {
  if (pkg.length <= 4096) throw new OfficeError('format', 'Contenu trop petit pour le format protégé.');
  const SS = 512;
  const t = (BigInt(Math.round(now)) + 11644473600000n) * 10000n;
  const ftLo = Number(t & 0xffffffffn);
  const ftHi = Number(t >> 32n);
  // Arborescence (identique à celle des fichiers protégés d'Office) : [nom, type, couleur, gauche, droite, enfant, contenu]
  // type : 1 dossier, 2 flux, 5 racine ; couleur : 0 rouge, 1 noir.
  const N = FREESECT;
  const dirs = [
    ['Root Entry', 5, 0, N, N, 10, null],
    ['EncryptedPackage', 2, 0, N, N, N, pkg],
    ['\u0006DataSpaces', 1, 0, N, N, 4, null],
    ['Version', 2, 1, N, N, N, DS_VERSION],
    ['DataSpaceMap', 2, 1, 3, 5, N, DS_MAP],
    ['DataSpaceInfo', 1, 1, N, 7, 6, null],
    ['StrongEncryptionDataSpace', 2, 1, N, N, N, DS_STRONG],
    ['TransformInfo', 1, 0, N, N, 8, null],
    ['StrongEncryptionTransform', 1, 1, N, N, 9, null],
    ['\u0006Primary', 2, 1, N, N, N, DS_PRIMARY],
    ['EncryptionInfo', 2, 1, 2, 1, N, info],
  ].map(([name, type, color, left, right, child, data]) => ({ name, type, color, left, right, child, data, start: 0 }));

  // Petits flux dans le « mini-flux » (blocs de 64 octets)
  let mini = 0;
  const miniChains = [];
  for (const d of dirs) {
    if (d.type !== 2 || d.data === pkg) continue;
    if (d.data.length >= 4096) throw new OfficeError('format', 'Description du chiffrement trop longue.');
    const n = Math.ceil(d.data.length / 64);
    d.start = mini;
    miniChains.push([mini, n]);
    mini += n;
  }
  const nMiniFat = Math.ceil(mini / (SS / 4));
  const nDir = Math.ceil(dirs.length / 4);
  const nMiniData = Math.ceil((mini * 64) / SS);
  const nPkg = Math.ceil(pkg.length / SS);
  const content = nMiniFat + nDir + nMiniData + nPkg;
  let nFat = 0;
  let nDifat = 0;
  for (;;) {
    const f = Math.ceil((nDifat + nFat + content) / (SS / 4));
    const d = f > 109 ? Math.ceil((f - 109) / (SS / 4 - 1)) : 0;
    if (f === nFat && d === nDifat) break;
    nFat = f;
    nDifat = d;
  }
  const fatPos = nDifat;
  const miniFatPos = fatPos + nFat;
  const dirPos = miniFatPos + nMiniFat;
  const miniDataPos = dirPos + nDir;
  const pkgPos = miniDataPos + nMiniData;
  const total = pkgPos + nPkg;
  const out = new Uint8Array(SS + total * SS);
  const dv = new DataView(out.buffer);
  const at = (sector) => SS + sector * SS;

  // En-tête
  out.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const H16 = [0x3e, 3, 0xfffe, 9, 6, 0, 0, 0];
  H16.forEach((v, i) => dv.setUint16(24 + i * 2, v, true));
  const H32 = [0, nFat, dirPos, 0, 4096, miniFatPos, nMiniFat, nDifat ? 0 : ENDOFCHAIN, nDifat];
  H32.forEach((v, i) => dv.setUint32(40 + i * 4, v, true));
  for (let i = 0; i < 109; i++) dv.setUint32(76 + i * 4, i < nFat ? fatPos + i : FREESECT, true);

  // Table d'allocation (FAT)
  const fat = new Uint32Array(nFat * (SS / 4)).fill(FREESECT);
  for (let i = 0; i < nDifat; i++) fat[i] = DIFSECT;
  for (let i = 0; i < nFat; i++) fat[fatPos + i] = FATSECT;
  const chain = (table, start, n) => {
    for (let k = 0; k < n; k++) table[start + k] = k < n - 1 ? start + k + 1 : ENDOFCHAIN;
  };
  chain(fat, miniFatPos, nMiniFat);
  chain(fat, dirPos, nDir);
  chain(fat, miniDataPos, nMiniData);
  chain(fat, pkgPos, nPkg);
  for (let i = 0; i < fat.length; i++) dv.setUint32(at(fatPos) + i * 4, fat[i], true);

  // Suite de la liste des secteurs FAT (au-delà de 109), pour les gros fichiers
  for (let s = 0; s < nDifat; s++) {
    const base = at(s);
    for (let j = 0; j < SS / 4 - 1; j++) {
      const k = 109 + s * (SS / 4 - 1) + j;
      dv.setUint32(base + j * 4, k < nFat ? fatPos + k : FREESECT, true);
    }
    dv.setUint32(base + SS - 4, s < nDifat - 1 ? s + 1 : ENDOFCHAIN, true);
  }

  // Mini-FAT
  const mfat = new Uint32Array(nMiniFat * (SS / 4)).fill(FREESECT);
  for (const [s, n] of miniChains) chain(mfat, s, n);
  for (let i = 0; i < mfat.length; i++) dv.setUint32(at(miniFatPos) + i * 4, mfat[i], true);

  // Répertoire
  dirs.forEach((d, i) => {
    const o = at(dirPos) + i * 128;
    for (let c = 0; c < d.name.length; c++) dv.setUint16(o + c * 2, d.name.charCodeAt(c), true);
    dv.setUint16(o + 64, (d.name.length + 1) * 2, true);
    out[o + 66] = d.type;
    out[o + 67] = d.color;
    dv.setUint32(o + 68, d.left, true);
    dv.setUint32(o + 72, d.right, true);
    dv.setUint32(o + 76, d.child, true);
    dv.setUint32(o + 100, ftLo, true);
    dv.setUint32(o + 104, ftHi, true);
    dv.setUint32(o + 108, ftLo, true);
    dv.setUint32(o + 112, ftHi, true);
    let start = 0;
    let size = 0;
    if (d.type === 5) {
      start = miniDataPos;
      size = mini * 64;
    } else if (d.type === 2) {
      start = d.data === pkg ? pkgPos : d.start;
      size = d.data.length;
    }
    dv.setUint32(o + 116, start, true);
    dv.setUint32(o + 120, size >>> 0, true);
    dv.setUint32(o + 124, Math.floor(size / 2 ** 32), true);
  });

  // Contenus
  for (const d of dirs) if (d.type === 2 && d.data !== pkg) out.set(d.data, at(miniDataPos) + d.start * 64);
  out.set(pkg, at(pkgPos));
  return out;
}
