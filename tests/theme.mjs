// Thèmes, barre d'onglets flottante, titres centrés, carte en plein écran (avec captures d'écran).
// node tests/theme.mjs plein : l'appli passe sous l'heure et la batterie (installation récente)
// node tests/theme.mjs bande : iOS garde sa bande en haut (installation d'avant ce changement)
import { start, unlock, sleep, URL0 } from './harness.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('tests/shots/theme', { recursive: true });
const mode = process.argv[2] || 'plein'; // 'plein' : l'appli passe sous l'heure ; 'bande' : iOS garde sa bande en haut
const insets = mode === 'plein' ? { top: 59, bottom: 34 } : { top: 0, bottom: 34 };
const { page, logs, stop } = await start({ insets });
const shot = (n) => page.screenshot({ path: `tests/shots/theme/${mode}-${n}.png` });
const check = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'ÉCHEC'} ${msg}`);
  if (!cond) process.exitCode = 1;
};
const rect = (sel) => page.$eval(sel, (e) => JSON.parse(JSON.stringify(e.getBoundingClientRect())));
const TOP = insets.top;
try {
  await page.goto(URL0, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#lock:not([hidden]) .lock-pad');
  await sleep(300);
  await shot('01-code');
  check((await page.$eval('#lock', (e) => getComputedStyle(e).backgroundColor)) === 'rgb(29, 78, 216)', 'écran du code aux couleurs du thème (bleu par défaut)');
  await unlock(page);
  await sleep(1500);
  await shot('02-carte');
  const mapR = await rect('#map');
  check(mapR.top === 0 && mapR.bottom === 844, 'carte sur toute la hauteur de l’écran');
  check((await rect('.map-search')).top === TOP + 10, 'recherche placée sous l’heure et la batterie');
  check(Math.abs((await rect('.map-scrim')).height - TOP * 1.6) < 1, TOP ? 'voile sous l’heure pour la lisibilité' : 'pas de voile quand iOS garde sa bande');
  const tb = await rect('#tabbar');
  check(tb.bottom === 844 - 24 && tb.left === 12 && tb.right === 378, 'barre d’onglets flottante, en bas, décalée des bords');
  await page.evaluate(() => __app.nav.goTab('contacts'));
  await sleep(500);
  await shot('03-contacts');
  const h1 = await rect('#tab-contacts .tab-head h1');
  check(Math.abs(h1.left + h1.width / 2 - 195) < 1.5, 'titre centré dans la barre du haut');
  check((await rect('#tab-contacts .tab-head')).height === TOP + 56, 'barre du haut colorée jusque sous l’heure');
  await page.evaluate(() => __app.nav.newContact({}));
  await sleep(600);
  await shot('04-fiche');
  const pt = await rect('.page.in .ph-title');
  check(Math.abs(pt.left + pt.width / 2 - 195) < 1.5, 'titre de fiche centré');
  await page.evaluate(() => document.querySelector('.page.in .ph-close').click());
  await sleep(500);
  await page.evaluate(() => __app.nav.goTab('bord'));
  await sleep(600);
  await page.evaluate(() => document.querySelector('.theme-swatches').scrollIntoView({ block: 'center' }));
  await sleep(300);
  await shot('05-apparence');
  for (const t of ['rouge', 'bordeaux', 'framboise', 'graphite']) {
    await page.evaluate((id) => document.querySelector(`[data-theme-id="${id}"]`).click(), t);
    await sleep(300);
  }
  await page.evaluate(() => document.querySelector('[data-theme-id="bordeaux"]').click());
  await sleep(400);
  const th = await page.evaluate(() => ({
    head: getComputedStyle(document.documentElement).getPropertyValue('--head').trim(),
    meta: document.querySelector('meta[name="theme-color"]').content,
    saved: __app.S.settings.get('theme')?.value,
    btn: getComputedStyle(document.querySelector('#tab-bord .tab-head')).backgroundColor,
  }));
  check(th.head === '#7b1e33' && th.meta === '#7b1e33' && th.saved === 'bordeaux' && th.btn === 'rgb(123, 30, 51)', 'thème bordeaux appliqué et enregistré');
  await page.evaluate(() => document.querySelector('.theme-swatches').scrollIntoView({ block: 'center' }));
  await shot('06-apparence-bordeaux');
  await page.evaluate(() => __app.nav.goTab('carte'));
  await sleep(800);
  await page.evaluate(() => {
    const a = [...__app.S.addrs.values()].find((x) => x.ilot === 60);
    __app.nav.openAddress(a.id);
  });
  await sleep(900);
  await shot('07-carte-bordeaux-feuille');
  await page.evaluate(() => __app.nav.goTab('relances'));
  await sleep(500);
  await shot('08-relances-bordeaux');
  await page.evaluate(() => __app.nav.goTab('bord'));
  await sleep(400);
  await page.evaluate(() => document.querySelector('[data-locknow]').click());
  await sleep(500);
  await shot('09-code-bordeaux');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(250);
  const th2 = await page.evaluate(() => [document.documentElement.dataset.theme, getComputedStyle(document.getElementById('boot')).backgroundColor]);
  check(th2[0] === 'bordeaux' && th2[1] === 'rgb(123, 30, 51)', 'au redémarrage, le thème s’affiche dès l’écran de chargement');
  await unlock(page);
  const sh = await rect('#tabbar');
  check(sh.bottom === 844 - 24, 'barre toujours en place après redémarrage');
} catch (e) {
  console.error('ÉCHEC', e);
  await shot('zz-echec');
  process.exitCode = 1;
} finally {
  console.log(logs.length ? logs.join('\n') : 'Aucune erreur console');
  await stop();
}
