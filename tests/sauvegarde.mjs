// Export puis import, comme lors d'une réinstallation de l'icône :
// une appli remplie de données de toutes sortes est exportée, puis le fichier est restauré
// dans une appli vierge (stockage séparé, autre code), et tout est comparé champ par champ.
import { start, unlock, freshInstall, sleep, tapText, URL0, PIN } from './harness.mjs';
import { mkdirSync, readdirSync, rmSync, readFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readXlsx } from '../src/xlsx.js';

const BPWD = 'tulipe-Velo-Orage 2026';
const PIN2 = '519372';
const DL = resolve('tests/downloads/sauvegarde');
rmSync(DL, { recursive: true, force: true });
mkdirSync(DL, { recursive: true });

const { browser, page, logs, stop } = await start();
const check = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'ÉCHEC'} ${msg}`);
  if (!cond) process.exitCode = 1;
};
const dlgBtn = (p, txt) => tapText(p, '.dlg-buttons button', txt);
async function waitFile(ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const f = readdirSync(DL).find((x) => x.startsWith('prospection-sauvegarde') && x.endsWith('.xlsx'));
    if (f) {
      await sleep(500);
      return resolve(DL, f);
    }
    await sleep(200);
  }
  return null;
}

// Photo instantanée des données (empreinte des images comprise)
const snapshot = (p) =>
  p.evaluate(async () => {
    const S = __app.S;
    const LOCAL = ['lastExport', 'mapView', 'dvf', 'backupPwd'];
    const list = (m) => [...m.values()].map((x) => JSON.parse(JSON.stringify(x))).sort((a, b) => (a.id < b.id ? -1 : 1));
    const hex = async (b) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('');
    const photoData = {};
    for (const r of await __app.photos.allPhotoRecords()) photoData[r.id] = { hash: await hex(r.bytes), taille: r.bytes.length, type: r.type };
    const st = __app.state;
    const colors = {};
    for (const id of S.addrUser.keys()) colors[id] = st.addressColor(id);
    for (const c of S.contacts.values()) colors['contact:' + c.id] = st.contactColor(c);
    return {
      contacts: list(S.contacts),
      links: list(S.links),
      logements: list(S.logements),
      passages: list(S.passages),
      relances: list(S.relances),
      scenarios: list(S.scenarios),
      addrUser: list(S.addrUser),
      photos: list(S.photos),
      photoData,
      settings: list(S.settings).filter((s) => !LOCAL.includes(s.id)),
      adressesAjoutees: [...S.addrs.values()].filter((a) => a.custom).map((a) => JSON.parse(JSON.stringify(a))),
      couleurs: colors,
    };
  });

// Différences tolérées, voulues par le format Excel : heures à la seconde près,
// valeurs vides équivalentes (absent, vide, non), date de modification non gardée pour les éléments secondaires.
const TIME_KEYS = new Set(['createdAt', 'updatedAt', 'deletedAt', 't', 'doneAt']);
function norm(v, key = '', store = '') {
  if (TIME_KEYS.has(key) && typeof v === 'number') return Math.floor(v / 1000) * 1000;
  if (Array.isArray(v)) return v.length ? v.map((x) => norm(x, '', store)) : undefined;
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) {
      if (k === 'updatedAt' && ['logements', 'relances', 'scenarios', 'links', 'passages'].includes(store)) continue;
      if (k === 'ilot' && store === 'addrUser' && !v.custom) continue; // ajouté pour information dans le fichier
      const x = norm(v[k], k, store);
      if (x !== undefined) o[k] = x;
    }
    return o;
  }
  if (v === null || v === '' || v === false || v === undefined) return undefined;
  return v;
}
function diff(a, b, path = '') {
  const out = [];
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out.push(...diff(a[k], b[k], `${path}.${k}`));
    return out;
  }
  return [`${path} : ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`];
}
function compare(A, B, label) {
  let all = 0;
  for (const store of Object.keys(A)) {
    const d = diff(norm(A[store], '', store), norm(B[store], '', store), store);
    all += d.length;
    if (d.length) console.log(`     ${store} :\n       ${d.slice(0, 8).join('\n       ')}`);
  }
  check(all === 0, label);
}

try {
  const cdp = await browser.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
  await page.goto(URL0, { waitUntil: 'networkidle0' });
  await unlock(page, PIN);

  // ---------- 1. Une appli remplie de données de toutes sortes ----------
  const ids = await page.evaluate(async () => {
    const st = __app.state;
    const S = __app.S;
    const now = Date.now();
    const D = 86400000;
    const day = (d) => new Date(now - d * D).toISOString().slice(0, 10);
    const addrs = [...S.addrs.values()];
    const a1 = addrs.find((a) => a.ilot === 60).id;
    const a2 = addrs.find((a) => a.ilot === 45).id;
    const a3 = addrs.filter((a) => a.ilot === 4)[3].id;
    const base = S.addrs.get(a1);
    const sc1 = await st.saveScenario({ titre: 'Voisin vendu', texte: 'Bonjour, une maison de votre rue vient de se vendre.\nJe passe vous en parler.' });
    await st.saveScenario({ titre: 'Ancien scénario', texte: 'À la corbeille', deletedAt: now - 1 * D });
    const long = 'Texte long. '.repeat(180);
    const c1 = await st.saveContact(
      st.newContact({
        prenom: 'Élodie',
        nom: 'N’Guyen-Lefèvre',
        tel: '06 12 34 56 78',
        email: 'elodie.nguyen@example.fr',
        occupation: 'proprietaire',
        anneeArrivee: 2016,
        logType: 'Maison',
        surface: 92.5,
        pieces: 4,
        etat: 'Bon état',
        interet: 2,
        projet: 'Vente au printemps ; veut une estimation',
        mandatSigne: true,
        mandatDate: day(48),
        remarques: `Ligne 1\nLigne 2 « guillemets » & <chevrons>, point-virgule ; émoji 🏡\n${long}`,
        tags: ['jardin', 'succession'],
        accord: true,
        accordDate: day(60),
        accordMode: 'ecrit',
        createdAt: now - 90 * D,
      }),
    );
    const c2 = await st.saveContact(st.newContact({ prenom: 'Marc', nom: 'Durand', occupation: 'locataire', nePlusSolliciter: true, nePlusDate: day(10), refusNote: 'Ne veut plus être démarché', createdAt: now - 30 * D }));
    const c3 = await st.saveContact(st.newContact({ prenom: 'Samia', nom: 'Benali', tel: '07 00 00 00 01', interet: 1, accord: true, accordDate: day(3), accordMode: 'message' }));
    const c4 = await st.saveContact(st.newContact({ prenom: 'Corbeille', nom: 'Test', deletedAt: now - 2 * D }));
    const c5 = await st.saveContact(st.newContact({ prenom: 'Jean', nom: 'Bailleur', email: 'jean@example.com' }));
    await st.setContactLinks(c1.id, [{ addressId: a1, role: 'habitant' }]);
    await st.setContactLinks(c5.id, [{ addressId: a1, role: 'proprio' }]);
    await st.setContactLinks(c2.id, [{ addressId: a2, role: 'habitant' }]);
    await st.saveAddrUser({ id: a2, type: 'maison', color: 'rouge', colorAt: day(10), signals: ['panneau', 'travaux'], signalAutre: 'Volets fermés depuis l’été', tags: ['angle de rue'], note: 'Chien ; sonner deux fois', acces: 'Portail bleu' });
    await st.saveAddrUser({ id: a1, type: 'maison', signals: ['vide'] });
    await st.saveAddrUser({ id: 'perso-test1', custom: true, num: '12', rep: 'bis', voie: 'Allée des Tests', lon: base.lon + 0.0003, lat: base.lat + 0.0001, ilot: 60, note: 'Ajoutée à la main' });
    await st.saveBuilding(a3, {
      user: { id: a3, type: 'immeuble', acces: 'Code 4512B', etages: [{ id: 'et-1', label: '1er' }, { id: 'et-0', label: 'RDC' }, { id: 'et-s', label: 'Sous-sol', basement: true }] },
      logements: [
        { id: 'lg1', addressId: a3, etageId: 'et-1', order: 0, loc: '1re porte à gauche', color: null, createdAt: now - 5 * D },
        { id: 'lg2', addressId: a3, etageId: 'et-1', order: 1, loc: 'Fond du couloir', color: 'rouge', createdAt: now - 5 * D },
        { id: 'lg3', addressId: a3, etageId: 'et-0', order: 0, loc: 'Gardienne', color: null, createdAt: now - 5 * D },
      ],
      deletedLogementIds: [],
      links: [{ id: 'lk-b1', contactId: c3.id, addressId: a3, logementId: 'lg1', role: 'habitant' }],
      deletedLinkIds: [],
    });
    const t0 = Math.floor((now - 6 * D) / 60000) * 60000 + 5000;
    await st.addPassage({ addressId: a1, result: 'contact', contactId: c1.id, scenarioId: sc1.id, note: 'Intéressée, rappeler', t: now - 20 * D });
    await st.addPassage({ addressId: a1, result: 'absent', t: now - 200 * D });
    // Deux passages dans la même minute : l'ordre doit être gardé
    await st.addPassage({ addressId: a2, result: 'absent', t: t0 });
    await st.addPassage({ addressId: a2, result: 'refus', contactId: c2.id, note: 'Refus net', t: t0 + 20000 });
    await st.addPassage({ addressId: a3, logementId: 'lg1', result: 'contact', contactId: c3.id, t: now - 3 * D });
    await st.addPassage({ addressId: a3, logementId: 'lg3', result: 'absent', t: now - 1 * D });
    await st.saveRelance({ contactId: c1.id, date: day(-7), heure: '18:30', objet: 'Rappeler pour l’estimation' });
    await st.saveRelance({ contactId: c3.id, date: day(5), heure: '', objet: 'Relance faite', done: true, doneAt: now - 4 * D });
    await st.setSetting('mention', { nom: 'Léa Test', fonction: 'conseillère immobilière', agence: 'Agence Test, Champigny-sur-Marne', contact: 'lea@example.com' });
    await st.setSetting('lockDelay', 300);
    await st.setSetting('legendeMini', true);
    return { a1, a2, a3 };
  });
  // Deux photos, ajoutées comme dans l'appli
  await page.evaluate((id) => __app.nav.openAddressPage(id), ids.a1);
  await sleep(600);
  for (const f of ['public/icons/icon-192.png', 'public/icons/icon-512.png']) {
    const [chooser] = await Promise.all([page.waitForFileChooser(), page.evaluate(() => document.querySelector('.page.in [data-photo="pick"]').click())]);
    await chooser.accept([resolve(f)]);
    await sleep(1500);
  }
  await page.evaluate(() => document.querySelector('.page.in .ph-close').click());
  await sleep(500);
  // Thème choisi dans les paramètres
  await page.evaluate(() => __app.nav.goTab('bord'));
  await sleep(500);
  await page.evaluate(() => document.querySelector('[data-theme-id="bordeaux"]').click());
  await sleep(300);
  const A = await snapshot(page);
  check(A.contacts.length === 5 && A.photos.length === 2 && Object.keys(A.photoData).length === 2 && A.logements.length === 3 && A.passages.length === 6, `appli remplie : ${A.contacts.length} contacts, ${A.passages.length} passages, ${A.logements.length} appartements, ${A.photos.length} photos`);

  // ---------- 2. Export ----------
  await tapText(page, '#tab-bord [data-export]');
  await page.waitForSelector('.dlg [name="p1"]');
  await page.type('.dlg [name="p1"]', BPWD);
  await page.type('.dlg [name="p2"]', BPWD);
  await dlgBtn(page, 'Enregistrer');
  const fileA = await waitFile();
  check(!!fileA, 'fichier de sauvegarde exporté');
  renameSync(fileA, `${DL}/export-A.xlsx`);
  const raw = readFileSync(`${DL}/export-A.xlsx`);
  check(raw[0] === 0xd0 && raw[1] === 0xcf, 'fichier protégé par le mot de passe');
  execFileSync('python3', ['tests/office_check.py', 'decrypt', `${DL}/export-A.xlsx`, BPWD, `${DL}/clair-A.xlsx`]);
  const wbA = readXlsx(readFileSync(`${DL}/clair-A.xlsx`));
  check(['Infos', 'Contacts', 'Liens', 'Adresses', 'Appartements', 'Passages', 'Relances', 'Scenarios', 'Reglages', 'Photos'].every((n) => wbA[n]), 'toutes les feuilles présentes');
  const lo = execFileSync('python3', ['tests/office_check.py', 'libreoffice', `${DL}/export-A.xlsx`, BPWD], { encoding: 'utf8', timeout: 180000 });
  check(/FEUILLES .*Contacts/.test(lo), 'le fichier s’ouvre dans un tableur avec le mot de passe (LibreOffice)');

  // ---------- 3. Réinstallation : appli vierge, autre code, restauration ----------
  const { ctx, page: p2 } = await freshInstall(browser, logs);
  await p2.goto(URL0, { waitUntil: 'networkidle0' });
  await unlock(p2, PIN2);
  check((await p2.evaluate(() => __app.S.contacts.size)) === 0, 'nouvelle installation vide');
  await p2.evaluate(() => __app.nav.goTab('bord'));
  await sleep(500);
  const [ch] = await Promise.all([p2.waitForFileChooser(), p2.evaluate(() => document.querySelector('#tab-bord [data-restore]').click())]);
  await ch.accept([`${DL}/export-A.xlsx`]);
  await p2.waitForSelector('.dlg [name="p"]');
  await p2.type('.dlg [name="p"]', 'pas le bon');
  await dlgBtn(p2, 'Ouvrir');
  await p2.waitForFunction(() => /incorrect/.test(document.querySelector('.dlg [data-err]')?.textContent || ''), { timeout: 20000 });
  check(true, 'mauvais mot de passe refusé');
  await p2.type('.dlg [name="p"]', BPWD);
  await dlgBtn(p2, 'Ouvrir');
  await p2.waitForFunction(() => [...document.querySelectorAll('.dlg-title')].some((e) => /Restaurer/.test(e.textContent)), { timeout: 20000 });
  await dlgBtn(p2, 'Remplacer mes données');
  await unlock(p2, PIN2);
  await sleep(500);
  const B = await snapshot(p2);
  compare(A, B, 'tout est revenu à l’identique : contacts, liens, adresses, immeuble, passages, relances, scénarios, photos, réglages, couleurs');
  check(B.couleurs[ids.a2] === A.couleurs[ids.a2] && B.couleurs[ids.a2] === 'rouge', 'ordre des passages d’une même minute gardé (adresse toujours en rouge)');
  check((await p2.evaluate(() => document.documentElement.dataset.theme)) === 'bordeaux', 'thème retrouvé');
  check(await p2.evaluate(() => !!__app.S.settings.get('backupPwd')), 'mot de passe des sauvegardes repris');

  // ---------- 4. Nouvel export depuis l'appli restaurée : même contenu ----------
  await p2.evaluate(() => __app.nav.goTab('bord'));
  await sleep(400);
  const cdp2 = await p2.createCDPSession();
  await cdp2.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, browserContextId: ctx.id });
  await tapText(p2, '#tab-bord [data-export]');
  const fileB = await waitFile();
  check(!!fileB, 'nouvel export sans redemander le mot de passe');
  renameSync(fileB, `${DL}/export-B.xlsx`);
  execFileSync('python3', ['tests/office_check.py', 'decrypt', `${DL}/export-B.xlsx`, BPWD, `${DL}/clair-B.xlsx`]);
  const wbB = readXlsx(readFileSync(`${DL}/clair-B.xlsx`));
  const sheetDiffs = [];
  for (const n of Object.keys(wbA)) {
    const a = JSON.stringify(n === 'Infos' ? wbA[n].filter((r) => r[0] !== 'exporte_le') : wbA[n]);
    const b = JSON.stringify(n === 'Infos' ? wbB[n].filter((r) => r[0] !== 'exporte_le') : wbB[n]);
    if (a !== b) sheetDiffs.push(n);
  }
  check(sheetDiffs.length === 0, `second export identique au premier${sheetDiffs.length ? ' (diffère : ' + sheetDiffs.join(', ') + ')' : ''}`);

  // ---------- 5. Ancienne sauvegarde non protégée : toujours acceptée ----------
  const { page: p3 } = await freshInstall(browser, logs);
  await p3.goto(URL0, { waitUntil: 'networkidle0' });
  await unlock(p3, PIN2);
  await p3.evaluate(() => __app.nav.goTab('bord'));
  await sleep(500);
  const [ch3] = await Promise.all([p3.waitForFileChooser(), p3.evaluate(() => document.querySelector('#tab-bord [data-restore]').click())]);
  await ch3.accept([`${DL}/clair-A.xlsx`]);
  await p3.waitForFunction(() => [...document.querySelectorAll('.dlg-title')].some((e) => /Restaurer/.test(e.textContent)), { timeout: 20000 });
  await dlgBtn(p3, 'Remplacer mes données');
  await unlock(p3, PIN2);
  await sleep(500);
  compare(A, await snapshot(p3), 'ancienne sauvegarde non protégée restaurée à l’identique');
} catch (e) {
  console.error('ÉCHEC', e);
  process.exitCode = 1;
} finally {
  console.log(logs.length ? logs.join('\n') : 'Aucune erreur console');
  await stop();
}
