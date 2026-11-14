// Code d'accès, chiffrement des données, accord RGPD, règle des 3 ans, mention d'information, mise à jour obligatoire.
import { start, unlock, shot, tapText, sleep, URL0, PIN } from './harness.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const SW_PATH = 'dist/sw.js';
const SW_ORIG = readFileSync(SW_PATH, 'utf8');
const { page, logs, stop } = await start();
const check = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'ÉCHEC'} ${msg}`);
  if (!cond) process.exitCode = 1;
};
const dlgBtn = (txt) => tapText(page, '.dlg-buttons button', txt);
const lockTitle = () => page.$eval('#lock:not([hidden]) .lock-title', (e) => e.textContent).catch(() => '');
const lockMsg = () => page.$eval('#lock .lock-msg', (e) => e.textContent).catch(() => '');
const waitTitle = async (re) => {
  for (let i = 0; i < 200; i++) {
    if (re.test(await lockTitle())) return true;
    await sleep(100);
  }
  throw new Error('écran attendu : ' + re);
};
const waitMsg = async (re) => {
  for (let i = 0; i < 100; i++) {
    if (re.test(await lockMsg())) return true;
    await sleep(100);
  }
  return false;
};
// Lecture brute de la base, comme le ferait quelqu'un qui récupère les fichiers du téléphone.
const rawDump = () =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('prospection');
        r.onsuccess = () => {
          const db = r.result;
          const out = {};
          const names = [...db.objectStoreNames];
          const tx = db.transaction(names);
          for (const n of names) tx.objectStore(n).getAll().onsuccess = (e) => (out[n] = e.target.result);
          tx.oncomplete = () => {
            const txt = {};
            for (const [n, recs] of Object.entries(out))
              txt[n] = recs.map((x) => {
                const o = {};
                for (const [k, v] of Object.entries(x)) o[k] = v instanceof Uint8Array || v instanceof ArrayBuffer ? new TextDecoder('latin1').decode(v) : v;
                return JSON.stringify(o);
              });
            db.close();
            res(txt);
          };
        };
      }),
  );
const setVisibility = (state) =>
  page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);

try {
  // ---------- 1. Données d'une ancienne version (non chiffrées) : reprises et chiffrées ----------
  await page.goto(URL0 + 'manifest.webmanifest');
  await sleep(600);
  logs.length = 0; // (icône d'onglet absente sur cette page technique)
  const addrId = JSON.parse(readFileSync('dist/data/base.json', 'utf8')).adresses.find((a) => a[6] === 60)[0];
  await page.evaluate(
    (aid) =>
      new Promise((res, rej) => {
        const r = indexedDB.open('prospection', 1);
        r.onupgradeneeded = () => {
          for (const s of ['contacts', 'links', 'logements', 'passages', 'relances', 'scenarios', 'addrs', 'photos', 'settings']) r.result.createObjectStore(s, { keyPath: 'id' });
        };
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction(['contacts', 'links', 'passages', 'photos', 'settings'], 'readwrite');
          tx.objectStore('contacts').put({ id: 'c-ancien', prenom: 'Ancienne', nom: 'Fiche', tel: '0611223344', occupation: 'proprietaire', interet: 2, tags: [], createdAt: Date.now() - 5 * 86400000 });
          tx.objectStore('links').put({ id: 'l-ancien', contactId: 'c-ancien', addressId: aid, logementId: null, role: 'habitant' });
          tx.objectStore('passages').put({ id: 'p-ancien', addressId: aid, result: 'contact', contactId: 'c-ancien', t: Date.now() - 5 * 86400000 });
          const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
          tx.objectStore('photos').put({ id: 'ph-ancien', addressId: aid, blob: new Blob([png], { type: 'image/png' }), w: 1, h: 1, createdAt: Date.now() });
          tx.objectStore('settings').put({ id: 'lastExport', value: Date.now() - 2 * 86400000 });
          tx.oncomplete = () => {
            db.close();
            res();
          };
          tx.onerror = () => rej(tx.error);
        };
      }),
    addrId,
  );
  await page.goto(URL0, { waitUntil: 'networkidle0' });
  await waitTitle(/Crée ton code/);
  check(/Nouveau : l’appli se protège/.test(await page.$eval('#lock .lock-sub', (e) => e.textContent)), 'ancienne version détectée : message d’explication');
  await shot(page, '50-creation-code');
  await page.keyboard.type('123456');
  check(await waitMsg(/trop facile/), 'code trop simple refusé (123456)');
  await page.keyboard.type('147258');
  await waitTitle(/Confirme/);
  await page.keyboard.type('147259');
  await waitTitle(/Crée ton code/);
  check(/différents/.test(await lockMsg()), 'deux codes différents : on recommence');
  await unlock(page, PIN);
  const mig = await page.evaluate(() => ({ c: __app.S.contacts.get('c-ancien'), ph: __app.S.photos.size, lastExport: __app.S.settings.get('lastExport')?.value }));
  check(mig.c?.prenom === 'Ancienne' && mig.c?.tel === '0611223344' && mig.ph === 1 && mig.lastExport, 'anciennes données reprises après création du code');
  let dump = await rawDump();
  const all = JSON.stringify(dump);
  check(!/Ancienne|0611223344|c-ancien|l-ancien|p-ancien|ph-ancien/.test(all) && !all.includes(addrId), 'base brute : ni nom, ni téléphone, ni identifiant, ni adresse lisibles');
  check(dump.photos.length === 1 && dump.photoData.length === 1 && !/PNG/.test(dump.photos[0] + dump.photoData[0]), 'photo reprise et chiffrée (image séparée de sa description)');
  check(dump.vault.length === 1 && !/258014/.test(JSON.stringify(dump.vault)), 'coffre enregistré, code jamais stocké');

  // ---------- 2. Photo lisible après chiffrement ----------
  await page.evaluate((aid) => __app.nav.openAddressPage(aid), addrId);
  await sleep(900);
  const imgW = await page.$eval('.page.in .photos img', (e) => e.naturalWidth).catch(() => 0);
  check(imgW === 1, 'photo affichée depuis les données chiffrées');
  await page.evaluate(() => document.querySelector('.page.in .ph-close').click());
  await sleep(400);

  // ---------- 3. Déverrouillage : erreurs comptées, pause après 5 erreurs ----------
  await page.reload({ waitUntil: 'networkidle0' });
  await waitTitle(/Entre ton code/);
  for (let i = 1; i <= 3; i++) {
    await page.keyboard.type('000001');
    await sleep(700);
  }
  check(/Encore 2 essais/.test(await lockMsg()), 'après 3 erreurs : nombre d’essais restants affiché');
  await page.keyboard.type('000001');
  await sleep(700);
  await page.keyboard.type('000001');
  check(await waitMsg(/Réessaie dans/), 'après 5 erreurs : pause imposée');
  await shot(page, '51-pause-code');
  await page.reload({ waitUntil: 'networkidle0' });
  await waitTitle(/Entre ton code/);
  check(await waitMsg(/Réessaie dans/), 'la pause continue même si on relance l’appli');
  await page.keyboard.type(PIN);
  await sleep(600);
  check(!!(await page.$('#boot')), 'clavier bloqué pendant la pause');
  console.log('     attente de la fin de la pause (30 s)…');
  await sleep(31000);
  await page.keyboard.type(PIN);
  await page.waitForFunction(() => !document.getElementById('boot'), { timeout: 20000 });
  check(true, 'bon code accepté après la pause');

  // ---------- 4. Accord RGPD ----------
  await page.evaluate(() => __app.nav.newContact({}));
  await sleep(500);
  await page.type('.page.in [name="prenom"]', 'Zéphyrine');
  await page.type('.page.in [name="nom"]', 'Quintal');
  await page.type('.page.in [name="tel"]', '0698765432');
  await sleep(200);
  check(await page.$eval('.page.in [data-accordwarn]', (e) => !e.hidden), 'alerte « sans accord » dès qu’un numéro est saisi');
  await shot(page, '52-contact-sans-accord');
  await page.evaluate(() => document.querySelector('.page.in [data-call]').click());
  await sleep(400);
  check(await page.$eval('.dlg-title', (e) => e.textContent === 'Aucun accord noté'), 'appel sans accord : confirmation demandée');
  await dlgBtn('Annuler');
  await tapText(page, '.page.in .ph-save');
  await sleep(500);
  await page.evaluate(() => document.querySelector('.page.in .ph-close').click());
  await sleep(400);
  await page.evaluate(() => __app.nav.goTab('contacts'));
  await sleep(400);
  // 2 fiches : la nouvelle et celle reprise de l'ancienne version (numéro sans accord noté)
  check(await page.$eval('#tab-contacts [data-rgpd]', (e) => /2 contacts ont des coordonnées sans accord/.test(e.textContent)), 'Contacts : bandeau des accords manquants');
  check((await page.$$eval('#tab-contacts .li', (els) => els.filter((e) => /Zéphyrine/.test(e.textContent) && /Sans accord/.test(e.textContent)).length)) === 1, 'Contacts : badge « Sans accord »');
  await tapText(page, '#tab-contacts .rgpd-notice');
  const listed = await page.$$eval('#tab-contacts .li', (els) => els.map((e) => e.textContent));
  check(listed.length === 2 && listed.some((t) => /Zéphyrine/.test(t)) && listed.some((t) => /Ancienne/.test(t)), 'filtre « Accord manquant » : seulement les fiches à régulariser');
  await shot(page, '53-liste-accords-manquants');
  await page.evaluate(() => __app.nav.goTab('bord'));
  await sleep(600);
  check(await page.$eval('#tab-bord', (e) => /2 contacts ont un téléphone ou un email sans accord noté/.test(e.textContent)), 'Tableau : carte RGPD avec le nombre de fiches à régulariser');
  // Accord donné
  const zid = await page.evaluate(() => [...__app.S.contacts.values()].find((c) => c.prenom === 'Zéphyrine').id);
  await page.evaluate((id) => __app.nav.openContact(id), zid);
  await sleep(500);
  await page.click('.page.in [name="accord"]');
  await sleep(200);
  check(await page.$eval('.page.in [data-accorddetails]', (e) => e.style.display !== 'none') && (await page.$eval('.page.in [data-accordwarn]', (e) => e.hidden)), 'accord coché : date et mode affichés, alerte retirée');
  await page.select('.page.in [name="accordMode"]', 'ecrit');
  await tapText(page, '.page.in .ph-save');
  await sleep(400);
  const z = await page.evaluate((id) => __app.S.contacts.get(id), zid);
  check(z.accord === true && /^\d{4}-\d{2}-\d{2}$/.test(z.accordDate) && z.accordMode === 'ecrit', 'accord enregistré avec sa date et son mode (preuve)');
  await shot(page, '54-contact-accord');
  // Accord retiré : proposition d'effacer les coordonnées
  await page.click('.page.in [name="accord"]');
  await sleep(400);
  check(await page.$eval('.dlg-title', (e) => e.textContent === 'Accord retiré'), 'accord retiré : effacement des coordonnées proposé');
  await dlgBtn('Effacer');
  await sleep(300);
  check((await page.$eval('.page.in [name="tel"]', (e) => e.value)) === '', 'téléphone effacé');
  await tapText(page, '.page.in .ph-save');
  await sleep(300);
  // Ne plus solliciter : ne garder que nom + adresse, relances supprimées
  await page.type('.page.in [name="tel"]', '0698765432');
  await page.type('.page.in [name="projet"]', 'Vente dans 6 mois');
  await tapText(page, '.page.in .ph-save');
  await sleep(300);
  await page.evaluate((id) => __app.state.saveRelance({ contactId: id, date: '2030-01-10', heure: '', objet: 'Rappeler' }), zid);
  await sleep(300);
  await page.click('.page.in [name="nePlusSolliciter"]');
  await sleep(400);
  check(await page.$eval('.dlg-title', (e) => /Ne garder que le nom/.test(e.textContent)), '« Ne plus solliciter » : proposition de ne garder que le nom et l’adresse');
  await dlgBtn('Effacer le reste');
  await tapText(page, '.page.in .ph-save');
  await sleep(500);
  const z2 = await page.evaluate((id) => ({ c: __app.S.contacts.get(id), rel: [...__app.S.relances.values()].filter((r) => r.contactId === id && !r.done).length }), zid);
  check(z2.c.nePlusSolliciter && !z2.c.tel && !z2.c.projet && z2.c.nom === 'Quintal' && z2.rel === 0, 'coordonnées, projet et relances effacés, nom gardé');
  await page.evaluate(() => document.querySelector('.page.in .ph-close').click());
  await sleep(400);

  // ---------- 5. Mention d'information ----------
  await page.evaluate(() => __app.nav.goTab('bord'));
  await sleep(500);
  await tapText(page, '#tab-bord [data-mentionpage]');
  await sleep(500);
  await page.type('.page.in [name="nom"]', 'Léa Test');
  await page.type('.page.in [name="agence"]', 'Agence Test, Champigny-sur-Marne');
  await page.type('.page.in [name="contact"]', 'lea.test@example.com');
  const txt = await page.$eval('.page.in [data-text]', (e) => e.textContent);
  check(/Je suis Léa Test, conseillère immobilière \(Agence Test, Champigny-sur-Marne\)/.test(txt) && /3 ans/.test(txt) && /cnil\.fr/.test(txt) && /lea\.test@example\.com/.test(txt), 'mention : texte complet et personnalisé');
  check(!/—/.test(txt), 'mention sans tiret long');
  await tapText(page, '.page.in .ph-save');
  await sleep(300);
  await shot(page, '55-mention');
  await tapText(page, '.page.in [data-big]');
  await sleep(300);
  await shot(page, '56-mention-plein-ecran');
  await tapText(page, '.mention-close');
  await page.evaluate(() => document.querySelector('.page.in .ph-close').click());
  await sleep(400);

  // ---------- 6. Règle des 3 ans ----------
  await page.evaluate(async (aid) => {
    const st = __app.state;
    const old = Date.now() - 4 * 365 * 86400000;
    const c = await st.saveContact(st.newContact({ prenom: 'Très', nom: 'Ancien', tel: '0600000099', accord: true, accordDate: new Date(old).toISOString().slice(0, 10), createdAt: old }));
    await st.addPassage({ addressId: aid, result: 'contact', contactId: c.id, t: old });
    await st.saveContact(st.newContact({ prenom: 'Client', nom: 'Mandat', mandatSigne: true, mandatDate: '2021-01-01', createdAt: old }));
  }, addrId);
  await page.evaluate(() => __app.nav.goTab('contacts'));
  await page.evaluate(() => __app.nav.goTab('bord'));
  await sleep(600);
  check(await page.$eval('#tab-bord', (e) => /À supprimer : 1 contact et 1 passage/.test(e.textContent)), 'règle des 3 ans : vieux prospect repéré, client sous mandat épargné');
  await tapText(page, '#tab-bord [data-cleanup]');
  await sleep(400);
  await shot(page, '57-regle-3-ans');
  await dlgBtn('Supprimer définitivement');
  await sleep(600);
  const after3 = await page.evaluate(() => ({ ancien: [...__app.S.contacts.values()].some((c) => c.nom === 'Ancien'), client: [...__app.S.contacts.values()].some((c) => c.nom === 'Mandat') }));
  check(!after3.ancien && after3.client, 'vieux prospect supprimé, client gardé');
  dump = await rawDump();
  check(dump.contacts.length === (await page.evaluate(() => __app.S.contacts.size)), 'suppression effective dans la base');

  // ---------- 7. Verrouillage en arrière-plan, sans perdre la saisie ----------
  await page.select('#tab-bord [data-lockdelay]', '0');
  await sleep(300);
  await page.evaluate(() => __app.nav.newContact({}));
  await sleep(500);
  await page.type('.page.in [name="prenom"]', 'Saisie en cours');
  await setVisibility('hidden');
  check(await page.evaluate(() => document.body.classList.contains('masque')), 'aperçu masqué quand l’appli passe en arrière-plan');
  await sleep(200);
  await setVisibility('visible');
  await waitTitle(/Entre ton code/);
  check(true, 'appli verrouillée au retour');
  await shot(page, '58-verrouillage');
  await page.keyboard.type(PIN);
  await page.waitForFunction(() => document.getElementById('lock').hidden);
  check((await page.$eval('.page.in [name="prenom"]', (e) => e.value)) === 'Saisie en cours', 'saisie en cours retrouvée après déverrouillage');

  // ---------- 8. Mise à jour obligatoire (attend la fin de la saisie) ----------
  await page.evaluate(() => navigator.serviceWorker.ready);
  const sw0 = readFileSync(SW_PATH, 'utf8');
  writeFileSync(SW_PATH, `${sw0}\n// nouvelle version de test ${Date.now()}\n`);
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await sleep(2500);
  check(!(await page.$('#update-modal')), 'fiche en cours de saisie : la fenêtre de mise à jour attend');
  await tapText(page, '.page.in .ph-save');
  await sleep(300);
  await page.evaluate(() => document.querySelector('.page.in .ph-close').click());
  await page.waitForSelector('#update-modal', { timeout: 8000 });
  check(true, 'fiche enregistrée : fenêtre de mise à jour au centre');
  await shot(page, '59-mise-a-jour');
  await page.mouse.click(30, 120);
  check(!!(await page.$('#update-modal')), 'impossible de la fermer en touchant à côté');
  await tapText(page, '#update-modal [data-update]');
  await waitTitle(/Entre ton code/);
  check(!(await page.$('#update-modal')), 'nouvelle version chargée');
  writeFileSync(SW_PATH, sw0);
  await page.keyboard.type(PIN);
  await page.waitForFunction(() => !document.getElementById('boot'), { timeout: 20000 });
  check((await page.evaluate(() => __app.S.contacts.size)) >= 3, 'données intactes après la mise à jour');

  // ---------- 9. Changer le code ----------
  await page.evaluate(() => __app.nav.goTab('bord'));
  await sleep(500);
  await tapText(page, '#tab-bord [data-changecode]');
  await waitTitle(/Code actuel/);
  await page.keyboard.type(PIN);
  await waitTitle(/Nouveau code/);
  await page.keyboard.type('863071');
  await waitTitle(/Confirme/);
  await page.keyboard.type('863071');
  await page.waitForFunction(() => document.getElementById('lock').hidden, { timeout: 10000 });
  await tapText(page, '#tab-bord [data-locknow]');
  await waitTitle(/Entre ton code/);
  await page.keyboard.type(PIN);
  check(await waitMsg(/incorrect/), 'ancien code refusé après changement');
  await page.keyboard.type('863071');
  await page.waitForFunction(() => document.getElementById('lock').hidden, { timeout: 10000 });
  check(true, 'nouveau code accepté');

  // ---------- 10. Code oublié : tout effacer puis restaurer ----------
  await page.reload({ waitUntil: 'networkidle0' });
  await waitTitle(/Entre ton code/);
  await tapText(page, '#lock [data-forgot]');
  await tapText(page, '#lock .lock-buttons button', 'Tout effacer');
  await shot(page, '60-code-oublie');
  await tapText(page, '#lock .lock-buttons button', 'Effacer définitivement');
  await unlock(page, PIN);
  check(await page.$eval('.dlg-title', (e) => e.textContent === 'Données effacées').catch(() => false), 'après effacement : restauration proposée');
  check((await page.evaluate(() => __app.S.contacts.size)) === 0, 'données effacées');
  await dlgBtn('Plus tard');
} catch (e) {
  console.error('ÉCHEC', e);
  process.exitCode = 1;
  await shot(page, 'zz-echec-rgpd');
} finally {
  writeFileSync(SW_PATH, SW_ORIG);
  console.log(logs.length ? logs.join('\n') : 'Aucune erreur console');
  await stop();
}
