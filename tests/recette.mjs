// La Recette ne touche jamais aux données de la prod (D-020).
// Sur GitHub Pages, prod (/prospection/) et Recette (/prospection-recette/) ont la même origine,
// sosgrec.github.io : elles partagent IndexedDB, localStorage, sessionStorage et les caches.
// Ce test sert les deux sites construits sous la même origine, comme GitHub Pages, et vérifie
// que la Recette a ses propres noms partout, même quand on y efface tout.
// Avant : npm run build && npm run build:recette
import { start, unlock, tapText, sleep, URL0, PIN } from './harness.mjs';
import { existsSync, mkdtempSync, symlinkSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const check = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'ÉCHEC'} ${msg}`);
  if (!cond) process.exitCode = 1;
};
for (const d of ['dist', 'dist-recette']) {
  if (!existsSync(join(d, 'index.html'))) throw new Error(`${d}/ manquant : lancer npm run build && npm run build:recette`);
}

// ---------- 1. Ce qui se voit : nom, icône, bandeau ----------
const lire = (f) => readFileSync(f, 'utf8');
const mProd = JSON.parse(lire('dist/manifest.webmanifest'));
const mRec = JSON.parse(lire('dist-recette/manifest.webmanifest'));
check(mProd.name === 'Prospection' && mProd.short_name === 'Prospection', 'prod : nom « Prospection » inchangé');
check(mRec.name === 'Prospection Recette' && mRec.short_name === 'Prospection Recette', 'Recette : nom « Prospection Recette »');
const hProd = lire('dist/index.html');
const hRec = lire('dist-recette/index.html');
check(!hProd.includes('recette'), 'prod : aucune trace de la Recette dans la page');
check(hRec.includes('<title>Prospection Recette</title>') && hRec.includes('name="apple-mobile-web-app-title" content="Prospection Recette"'), 'Recette : titre et nom sous l’icône de l’iPhone');
check(hRec.includes('id="recette-bandeau"'), 'Recette : bandeau RECETTE');
check(!readFileSync('dist/icons/apple-touch-icon.png').equals(readFileSync('dist-recette/icons/apple-touch-icon.png')), 'Recette : icône différente de la prod (orange)');

// ---------- 2. Les deux sites sous la même origine, comme sur GitHub Pages ----------
const SITE = mkdtempSync(join(tmpdir(), 'site-'));
symlinkSync(resolve('dist'), join(SITE, 'prospection'));
symlinkSync(resolve('dist-recette'), join(SITE, 'prospection-recette'));
const PROD = `${URL0}prospection/`;
const RECETTE = `${URL0}prospection-recette/`;
const PIN_RECETTE = '135792';

const { page, logs, stop } = await start({ dir: SITE });

// Tout ce que l'origine garde : bases (avec leur contenu brut, chiffré), localStorage, caches, service workers.
const etat = () =>
  page.evaluate(async () => {
    const bases = {};
    for (const { name } of await indexedDB.databases()) {
      const db = await new Promise((ok, ko) => {
        const r = indexedDB.open(name);
        r.onsuccess = () => ok(r.result);
        r.onerror = () => ko(r.error);
      });
      const contenu = {};
      for (const st of db.objectStoreNames) {
        contenu[st] = await new Promise((ok) => {
          const out = [];
          const c = db.transaction(st).objectStore(st).openCursor();
          c.onsuccess = () => {
            const cur = c.result;
            if (!cur) return ok(out);
            const v = cur.value;
            out.push(JSON.stringify([cur.key, v, v && typeof v === 'object' ? Object.values(v).map((x) => (x instanceof ArrayBuffer || ArrayBuffer.isView(x) ? [...new Uint8Array(x.buffer || x)] : null)) : null]));
            cur.continue();
          };
        });
      }
      db.close();
      bases[name] = contenu;
    }
    const ls = {};
    for (let i = 0; i < localStorage.length; i++) ls[localStorage.key(i)] = localStorage.getItem(localStorage.key(i));
    const regs = await navigator.serviceWorker.getRegistrations();
    return {
      bases,
      ls,
      caches: (await caches.keys()).sort(),
      scopes: regs.map((r) => new URL(r.scope).pathname).sort(),
    };
  });
const swPret = () => page.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 10000))]));
const titreCode = () => page.waitForSelector('#lock:not([hidden]) .lock-title', { timeout: 20000 }).then((e) => e.evaluate((x) => x.textContent));
const choisirTheme = async (id) => {
  await page.evaluate(() => __app.nav.goTab('bord'));
  await sleep(400);
  await tapText(page, `[data-theme-id="${id}"]`);
};

try {
  // ---------- 3. La prod, avec ses données ----------
  await page.goto(PROD, { waitUntil: 'networkidle0' });
  check(/Crée ton code/.test(await titreCode()), 'prod : premier démarrage');
  await unlock(page, PIN);
  await choisirTheme('bordeaux');
  check(await swPret(), 'prod : service worker en place');
  await sleep(500);
  const avant = await etat();
  check(Object.keys(avant.bases).join() === 'prospection', 'prod : une seule base, « prospection »');
  check(Object.values(avant.bases.prospection).some((s) => s.length > 0), 'prod : la base contient des données');
  check(JSON.parse(avant.ls['prospection-theme'] || '{}').id === 'bordeaux', 'prod : couleur gardée sous « prospection-theme »');
  check(avant.caches.length > 0 && avant.caches.every((c) => c.startsWith('prospection-') && !c.startsWith('prospection-recette')), `prod : caches ${avant.caches.join(', ')}`);

  // ---------- 4. La Recette, sur la même origine ----------
  await page.goto(RECETTE, { waitUntil: 'networkidle0' });
  check(/Crée ton code/.test(await titreCode()), 'Recette : demande un nouveau code, elle ne voit pas les données de la prod');
  const bandeau = await page.$eval('#recette-bandeau', (e) => {
    const r = e.getBoundingClientRect();
    return { txt: e.textContent, h: r.height, vu: getComputedStyle(e).display !== 'none' };
  });
  check(bandeau.txt === 'RECETTE' && bandeau.h > 0 && bandeau.vu, 'Recette : bandeau visible dès l’écran du code');
  await unlock(page, PIN_RECETTE);
  await choisirTheme('rouge');
  check(await swPret(), 'Recette : service worker en place');
  await sleep(500);

  // ---------- 5. Code oublié dans la Recette : tout y est effacé ----------
  await page.reload({ waitUntil: 'networkidle0' });
  check(/Entre ton code/.test(await titreCode()), 'Recette : redemande son propre code');
  await tapText(page, '#lock [data-forgot]');
  await tapText(page, '#lock .lock-buttons button', 'Tout effacer');
  await tapText(page, '#lock .lock-buttons button', 'Effacer définitivement');
  await unlock(page, PIN_RECETTE);
  check(await page.$eval('.dlg-title', (e) => e.textContent === 'Données effacées').catch(() => false), 'Recette : effacement fait, restauration proposée');
  await sleep(500);

  // ---------- 6. La prod n'a pas bougé ----------
  const apres = await etat();
  check(Object.keys(apres.bases).sort().join() === 'prospection,prospection-recette', `deux bases séparées : ${Object.keys(apres.bases).join(', ')}`);
  check(JSON.stringify(apres.bases.prospection) === JSON.stringify(avant.bases.prospection), 'base de la prod identique, octet pour octet, après l’effacement dans la Recette');
  check(apres.ls['prospection-theme'] === avant.ls['prospection-theme'], 'couleur de la prod inchangée');
  check(JSON.parse(apres.ls['prospection-recette-theme'] || '{}').id === 'rouge', 'couleur de la Recette sous « prospection-recette-theme »');
  const clesRecette = Object.keys(apres.ls).filter((k) => !(k in avant.ls));
  check(clesRecette.length > 0 && clesRecette.every((k) => k.startsWith('prospection-recette-')), `nouvelles clés de stockage toutes préfixées par la Recette : ${clesRecette.join(', ')}`);
  check(avant.caches.every((c) => apres.caches.includes(c)), 'caches de la prod toujours là');
  const cachesRecette = apres.caches.filter((c) => !avant.caches.includes(c));
  check(cachesRecette.length > 0 && cachesRecette.every((c) => c.startsWith('prospection-recette-')), `caches de la Recette à part : ${cachesRecette.join(', ')}`);
  // Le service worker de la prod supprime les caches « prospection-app-* » d'anciennes versions à chaque mise à jour.
  check(cachesRecette.every((c) => !c.startsWith('prospection-app-')), 'le ménage des mises à jour de la prod épargne les caches de la Recette');
  check(apres.scopes.length === 2 && apres.scopes.includes('/prospection/') && apres.scopes.includes('/prospection-recette/'), `un service worker chacun : ${apres.scopes.join(', ')}`);

  // ---------- 7. Retour dans la prod ----------
  await page.goto(PROD, { waitUntil: 'networkidle0' });
  check(/Entre ton code/.test(await titreCode()), 'prod : son code est toujours demandé');
  await unlock(page, PIN);
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === 'bordeaux', 'prod : ouverte avec son code et sa couleur');
  check(!(await page.$('#recette-bandeau')), 'prod : pas de bandeau');
} catch (e) {
  console.error('ÉCHEC', e);
  process.exitCode = 1;
  await page.screenshot({ path: 'tests/shots/zz-echec-recette.png' }).catch(() => {});
} finally {
  const erreurs = logs.filter((l) => !/favicon/.test(l));
  check(erreurs.length === 0, `aucune erreur dans la console${erreurs.length ? ' : ' + erreurs.join(' | ') : ''}`);
  await stop();
  rmSync(SITE, { recursive: true, force: true });
}
