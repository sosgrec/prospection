// Fichier Excel protégé par mot de passe : vérifications croisées avec msoffcrypto-tool, olefile et LibreOffice.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { encryptOffice, decryptOffice, writeCfb, isOfficeEncrypted } from '../src/officecrypto.js';
import { writeXlsx, readXlsx } from '../src/xlsx.js';

const DIR = resolve('tests/downloads/office');
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
const py = (...args) => execFileSync('python3', ['tests/office_check.py', ...args], { encoding: 'utf8', timeout: 180000 });
const check = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'ÉCHEC'} ${msg}`);
  if (!cond) process.exitCode = 1;
};
const same = (a, b) => a.length === b.length && Buffer.from(a).equals(Buffer.from(b));
const PWD = 'tulipe-Bus-rouge 42 éà';

// 1. Conteneur identique octet pour octet à celui de l'outil de référence
const rnd = (n, seed) => Uint8Array.from({ length: n }, (_, i) => (i * 131 + seed * 17) & 255);
for (const n of [5000, 300000]) {
  const pkg = rnd(n, 3);
  const info = rnd(1700, 5);
  writeFileSync(`${DIR}/pkg.bin`, pkg);
  writeFileSync(`${DIR}/info.bin`, info);
  py('ref', `${DIR}/pkg.bin`, `${DIR}/info.bin`, `${DIR}/ref.cfb`);
  const mine = writeCfb(pkg, info, Date.UTC(2026, 10, 14, 12, 0, 0));
  check(same(mine, readFileSync(`${DIR}/ref.cfb`)), `conteneur identique à la référence (${n} octets)`);
}

// 2. Classeur chiffré ici, ouvert par msoffcrypto (mot de passe vérifié + intégrité)
const rows = [['cle', 'valeur'], ['format', 'prospection-sauvegarde'], ['note', 'Accents éèà « guillemets » & <balises>']];
for (let i = 0; i < 400; i++) rows.push([`ligne_${i}`, `Valeur ${i} ${'x'.repeat(i % 50)}`]);
const xlsx = writeXlsx([{ name: 'Infos', rows }, { name: 'Contacts', rows: [['id', 'nom'], ['a1', 'Dupont']] }]);
const t0 = Date.now();
const enc = await encryptOffice(xlsx, PWD);
console.log(`     chiffrement en ${Date.now() - t0} ms, ${enc.length} octets`);
check(isOfficeEncrypted(enc), 'signature de fichier protégé');
writeFileSync(`${DIR}/protege.xlsx`, enc);
py('decrypt', `${DIR}/protege.xlsx`, PWD, `${DIR}/dechiffre-ref.xlsx`);
check(same(readFileSync(`${DIR}/dechiffre-ref.xlsx`), xlsx), 'msoffcrypto ouvre le fichier avec le mot de passe et retrouve le classeur exact');
let refused = false;
try {
  py('decrypt', `${DIR}/protege.xlsx`, 'mauvais', `${DIR}/x.xlsx`);
} catch {
  refused = true;
}
check(refused, 'msoffcrypto refuse un mauvais mot de passe');
console.log(py('ole', `${DIR}/protege.xlsx`).trim().replace(/^/gm, '     '));

// 3. Relecture ici (notre déchiffrement)
const back = await decryptOffice(enc, PWD);
check(same(back.bytes, xlsx) && back.intact === true, 'déchiffrement ici : classeur exact, intégrité vérifiée');
check(readXlsx(back.bytes).Infos[2][1] === 'Accents éèà « guillemets » & <balises>', 'texte accentué relu');
let bad = null;
try {
  await decryptOffice(enc, 'mauvais');
} catch (e) {
  bad = e.code;
}
check(bad === 'mdp', 'mauvais mot de passe détecté ici');

// 4. Fichier chiffré par l'outil de référence, ouvert ici
py('encrypt', `${DIR}/dechiffre-ref.xlsx`, PWD, `${DIR}/ref-protege.xlsx`);
const back2 = await decryptOffice(readFileSync(`${DIR}/ref-protege.xlsx`), PWD);
check(same(back2.bytes, xlsx), 'fichier protégé par l’outil de référence relu ici');

// 5. Gros fichier (plus de 7 Mo : liste étendue des secteurs), comme une sauvegarde avec beaucoup de photos
const noise = new Uint8Array(11 * 1024 * 1024);
for (let i = 0; i < noise.length; i += 65536) crypto.getRandomValues(noise.subarray(i, i + 65536));
const b64rows = [['id', 'partie_1']];
for (let i = 0; i < noise.length; i += 30000) b64rows.push([`p${i}`, Buffer.from(noise.subarray(i, i + 22500)).toString('base64')]);
const big = writeXlsx([{ name: 'Infos', rows: [['cle', 'valeur'], ['format', 'gros']] }, { name: 'Photos', rows: b64rows }]);
console.log(`     classeur de ${(big.length / 1048576).toFixed(1)} Mo`);
const t1 = Date.now();
const encBig = await encryptOffice(big, PWD);
console.log(`     gros fichier chiffré en ${Date.now() - t1} ms`);
writeFileSync(`${DIR}/gros.bin`, encBig);
py('ole', `${DIR}/gros.bin`);
py('decrypt', `${DIR}/gros.bin`, PWD, `${DIR}/gros-ref.bin`);
const nDifat = new DataView(encBig.buffer).getUint32(72, true);
check(nDifat > 0 && same(readFileSync(`${DIR}/gros-ref.bin`), big), `gros fichier (${(encBig.length / 1048576).toFixed(1)} Mo, ${nDifat} secteur(s) de liste étendue) : structure valide et contenu exact (msoffcrypto)`);
const backBig = await decryptOffice(encBig, PWD);
check(same(backBig.bytes, big) && backBig.intact, 'gros fichier relu ici');

// 6. Ouverture réelle dans LibreOffice avec le mot de passe
const lo = py('libreoffice', `${DIR}/protege.xlsx`, PWD);
console.log(lo.trim().replace(/^/gm, '     '));
check(/FEUILLES Infos,Contacts/.test(lo) && /A2 format B2 prospection-sauvegarde/.test(lo), 'LibreOffice ouvre le fichier avec le mot de passe');
let loBad = '';
try {
  loBad = py('libreoffice', `${DIR}/protege.xlsx`, 'mauvais');
} catch {
  loBad = 'refus';
}
check(!/FEUILLES/.test(loBad), 'LibreOffice refuse un mauvais mot de passe');
