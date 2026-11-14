// Sauvegarde Excel aller-retour, bilan PDF, ventes DVF, calendrier, parcelle, hors connexion.
import { start, boot, reload, shot, tapText, tapAddress, sleep, isolated, PIN } from './harness.mjs';
import { mkdirSync, readdirSync, rmSync, statSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readXlsx } from '../src/xlsx.js';
import { unlock } from './harness.mjs';

const BPWD = 'cactus-velo-Orage-17';

const DL = resolve('tests/downloads');
rmSync(DL, { recursive: true, force: true });
mkdirSync(DL, { recursive: true });
const { browser, page, logs, stop } = await start();
const check = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'ÉCHEC'} ${msg}`);
  if (!cond) process.exitCode = 1;
};
const dlgBtn = (txt) => tapText(page, '.dlg-buttons button', txt);
async function waitFile(ext, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const f = readdirSync(DL).find((x) => x.endsWith(ext));
    if (f) {
      await sleep(400);
      return resolve(DL, f);
    }
    await sleep(200);
  }
  return null;
}

try {
  const cdp = await browser.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
  await boot(page);
  const seeded = await page.evaluate(() => __app.S.addrs.size);
  check(seeded > 900, 'adresses chargées');

  // Création de données via l'interface : 3 contacts, passages variés
  const ids = await isolated(page, 60, 6);
  for (let i = 0; i < 6; i++) {
    await tapAddress(page, ids[i]);
    await tapText(page, '.sheet [data-pass]', i % 3 === 0 ? 'Contact' : 'Absent');
    if (i % 3 === 0) {
      await dlgBtn('Enregistrer');
      await sleep(500);
      await page.type('.page.in [name="prenom"]', `Test${i}`);
      await page.type('.page.in [name="nom"]', 'Dupont');
      await page.type('.page.in [name="tel"]', `06000000${10 + i}`);
      await page.type('.page.in [name="remarques"]', 'Ligne 1\nLigne 2 avec « guillemets » & symboles <ok>');
      await tapText(page, '.page.in .seg[data-seg="occupation"] button', 'Locataire');
      await page.click('.page.in [name="mandatSigne"]');
      await tapText(page, '.page.in .ph-save');
      await tapText(page, '.page.in .ph-close');
      await sleep(300);
    }
  }
  const before = await page.evaluate(() => ({ c: __app.S.contacts.size, p: __app.S.passages.size, l: __app.S.links.size }));
  check(before.c === 2 && before.p === 6, `données créées (${JSON.stringify(before)})`);

  // Doublon : même numéro de téléphone
  await page.evaluate(() => __app.nav.newContact({}));
  await sleep(500);
  await page.type('.page.in [name="prenom"]', 'Autre');
  await page.type('.page.in [name="tel"]', '+33 6 00 00 00 10');
  await tapText(page, '.page.in .ph-save');
  await sleep(300);
  check(await page.$eval('.dlg-title', (e) => e.textContent === 'Doublon possible'), 'doublon détecté (+33 = 06)');
  await shot(page, '30-doublon');
  await dlgBtn('Annuler');
  await page.evaluate(() => document.querySelector('.page.in').querySelector('.ph-close').click());
  await sleep(300);
  await dlgBtn('Ne pas enregistrer');
  await sleep(400);

  // Photo (fichier image généré)
  await page.evaluate(() => __app.nav.openAddressPage([...__app.S.addrs.values()].find((a) => a.ilot === 60).id));
  await sleep(500);
  const png = resolve('public/icons/icon-192.png');
  const [chooser] = await Promise.all([page.waitForFileChooser(), page.evaluate(() => document.querySelector('.page.in [data-photo="pick"]').click())]);
  await chooser.accept([png]);
  await sleep(1200);
  check((await page.evaluate(() => __app.S.photos.size)) === 1, 'photo ajoutée et compressée');
  await page.evaluate(() => document.querySelector('.page.in [data-sig="vide"]').click());
  await tapText(page, '.page.in .ph-save');
  await sleep(300);
  await shot(page, '31-fiche-adresse');
  await page.evaluate(() => document.querySelector('.page.in .ph-close').click());
  await sleep(400);

  // Export .xlsx protégé : le mot de passe est demandé au premier export
  await page.evaluate(() => __app.nav.goTab('bord'));
  await sleep(600);
  await tapText(page, '#tab-bord [data-export]');
  await page.waitForSelector('.dlg [name="p1"]');
  await page.type('.dlg [name="p1"]', 'court');
  await page.type('.dlg [name="p2"]', 'court');
  await dlgBtn('Enregistrer');
  check(await page.$eval('.dlg [data-err]', (e) => /au moins 10/.test(e.textContent)), 'mot de passe trop court refusé');
  await page.$eval('.dlg [name="p1"]', (e) => (e.value = ''));
  await page.$eval('.dlg [name="p2"]', (e) => (e.value = ''));
  await page.type('.dlg [name="p1"]', BPWD);
  await page.type('.dlg [name="p2"]', BPWD);
  await shot(page, '29-mot-de-passe-sauvegarde');
  await dlgBtn('Enregistrer');
  const xlsx = await waitFile('.xlsx');
  check(!!xlsx && statSync(xlsx).size > 3000, `fichier Excel exporté (${xlsx && statSync(xlsx).size} octets)`);
  const raw = readFileSync(xlsx);
  check(raw[0] === 0xd0 && raw[1] === 0xcf && !raw.includes(Buffer.from('Dupont')) && !raw.includes(Buffer.from('Dupont', 'utf16le')), 'fichier protégé : aucun nom lisible sans le mot de passe');
  execFileSync('python3', ['tests/office_check.py', 'decrypt', xlsx, BPWD, `${DL}/clair.xlsx`]);
  const wb = readXlsx(readFileSync(`${DL}/clair.xlsx`));
  check(wb.Contacts.length === 3 && wb.Contacts[0].includes('accord_rgpd') && wb.Infos[1][1] === 'prospection-sauvegarde', 'ouvert avec le mot de passe par l’outil de référence : contacts et colonnes RGPD présents');
  check(!(wb.Reglages || []).some((r) => r[0] === 'backupPwd'), 'le mot de passe n’est pas copié dans le fichier');
  console.log('XLSX', xlsx);

  // PDF
  await tapText(page, '#tab-bord [data-pdf]');
  const pdf = await waitFile('.pdf', 30000);
  check(!!pdf && readFileSync(pdf).subarray(0, 4).toString() === '%PDF', `bilan PDF généré (${pdf && statSync(pdf).size} octets)`);
  console.log('PDF', pdf);
  await shot(page, '32-tableau-apres-export');

  // Calendrier servi par le service worker
  await page.evaluate(() => navigator.serviceWorker.ready);
  await reload(page);
  const ics = await page.evaluate(async () => {
    const txt = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR';
    const b = btoa(txt).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const r = await fetch(`calendrier.ics?d=${b}`);
    return { type: r.headers.get('content-type'), body: await r.text(), ctrl: !!navigator.serviceWorker.controller };
  });
  check(ics.ctrl && ics.type.startsWith('text/calendar') && ics.body.startsWith('BEGIN:VCALENDAR'), `fichier calendrier servi hors réseau (${ics.type})`);

  // Ventes DVF sur la carte
  await page.evaluate(() => __app.nav.goTab('carte'));
  await page.evaluate(() => document.querySelector('[data-fab="dvf"]').click());
  const sale = await page.evaluate(() => {
    const v = __app.S.dvf.ventes.find((x) => x[13] === 60 && +x[1].slice(0, 4) >= new Date().getFullYear() - 2);
    __map.setView([v[9], v[8]], 18, { animate: false });
    const p = __map.latLngToContainerPoint([v[9], v[8]]);
    const r = document.getElementById('map').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });
  await sleep(500);
  await page.touchscreen.tap(sale.x, sale.y);
  await sleep(500);
  const sheetTxt = await page.$eval('.sheet', (e) => e.textContent).catch(() => '');
  check(/€/.test(sheetTxt), 'fiche de vente DVF affichée');
  await shot(page, '33-vente-dvf');
  await page.evaluate(() => document.querySelector('[data-fab="dvf"]').click());

  // Restauration : on efface tout, puis on recharge la sauvegarde
  await page.evaluate(
    () =>
      new Promise((res) => {
        indexedDB.databases?.();
        const r = indexedDB.deleteDatabase('prospection');
        r.onsuccess = r.onerror = r.onblocked = () => res();
        setTimeout(res, 1500);
      }),
  );
  await reload(page); // base vide : nouveau code
  const empty = await page.evaluate(() => __app.S.contacts.size + __app.S.passages.size);
  check(empty === 0, 'base vidée avant restauration');
  await page.evaluate(() => __app.nav.goTab('bord'));
  await sleep(500);
  const [ch2] = await Promise.all([page.waitForFileChooser(), page.evaluate(() => document.querySelector('#tab-bord [data-restore]').click())]);
  await ch2.accept([xlsx]);
  await page.waitForSelector('.dlg [name="p"]');
  await page.type('.dlg [name="p"]', 'pas le bon mot de passe');
  await dlgBtn('Ouvrir');
  await page.waitForFunction(() => /incorrect/.test(document.querySelector('.dlg [data-err]')?.textContent || ''), { timeout: 20000 });
  check(true, 'mauvais mot de passe de sauvegarde refusé');
  await page.type('.dlg [name="p"]', BPWD);
  await dlgBtn('Ouvrir');
  await page.waitForFunction(() => [...document.querySelectorAll('.dlg-title')].some((e) => /Restaurer/.test(e.textContent)), { timeout: 20000 });
  await shot(page, '34-confirmation-restauration');
  await dlgBtn('Remplacer mes données');
  await unlock(page);
  await sleep(500);
  const after = await page.evaluate(() => ({ c: __app.S.contacts.size, p: __app.S.passages.size, l: __app.S.links.size, ph: __app.S.photos.size, rem: [...__app.S.contacts.values()][0]?.remarques }));
  check(after.c === before.c && after.p === before.p && after.l === before.l && after.ph === 1, `restauration complète (${JSON.stringify({ ...after, rem: undefined })})`);
  check(after.rem === 'Ligne 1\nLigne 2 avec « guillemets » & symboles <ok>', 'texte multiligne et caractères spéciaux conservés');

  // Hors connexion
  check(await page.evaluate(() => !!__app.S.settings.get('backupPwd')), 'mot de passe des sauvegardes repris après restauration');
  await page.setOfflineMode(true);
  await reload(page, 'domcontentloaded');
  const off = await page.evaluate(() => ({ a: __app.S.addrs.size, c: __app.S.contacts.size }));
  check(off.a > 900 && off.c === before.c, 'l’appli démarre hors connexion avec toutes ses données');
  await shot(page, '35-hors-connexion');
  await page.setOfflineMode(false);
} catch (e) {
  console.error('ÉCHEC', e);
  process.exitCode = 1;
  await shot(page, 'zz-echec-flow2');
} finally {
  console.log(logs.length ? logs.join('\n') : 'Aucune erreur console');
  await stop();
}
