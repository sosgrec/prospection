// Thèmes, barre d'onglets flottante, titres centrés, carte en plein écran (avec captures d'écran).
// node tests/theme.mjs plein : l'appli passe sous l'heure et la batterie (installation récente)
// node tests/theme.mjs bande : iOS garde sa bande en haut (installation d'avant ce changement)
import { start, unlock, sleep, URL0 } from './harness.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('tests/shots/theme', { recursive: true });
// 'plein' : l'appli passe sous l'heure ; 'bande' : iOS garde sa bande en haut.
// Dans les deux cas, l'appli est ouverte depuis l'écran d'accueil (navigator.standalone, comme sur l'iPhone).
// Chrome ne reproduit pas l'appli raccourcie d'iOS 26 (bug WebKit 301108) : le test vérifie que la parade
// (page au moins aussi haute que l'écran) ne fait jamais défiler la page ni bouger la mise en page.
const mode = process.argv[2] || 'plein';
const insets = mode === 'bande' ? { top: 0, bottom: 34 } : { top: 59, bottom: 34 };
const { page, logs, stop } = await start({ insets });
await page.evaluateOnNewDocument(() => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true }));
const H = 844;
const GAP = 24;
const PLEIN = mode !== 'bande';
// Teinte des bandes d'iOS : gris foncé quand iOS garde sa bande en haut, gris clair du fond en plein écran
const BAND = PLEIN ? 'rgb(243, 244, 246)' : 'rgb(29, 32, 36)';
const shot = (n) => page.screenshot({ path: `tests/shots/theme/${mode}-${n}.png`, captureBeyondViewport: false });
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
  // iOS 26+ colore la bande de l'heure avec la couleur de fond déclarée (background-color) de l'élément fixé en haut :
  // elle doit rester neutre, l'apparence (couleur du thème) étant peinte par-dessus.
  const lockBg = await page.$eval('#lock', (e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).backgroundImage]);
  check(lockBg[0] === BAND && /29, 78, 216/.test(lockBg[1]), 'écran du code : couleur du thème à l’écran, teinte neutre pour les bandes d’iOS');
  const cls = await page.evaluate(() => [document.documentElement.classList.contains('plein'), document.documentElement.classList.contains('installee')]);
  check(cls[0] === PLEIN && cls[1], `appli installée détectée, mode d’affichage : ${mode}`);
  // La page fait la hauteur de l'écran, sans un point de plus : rien ne défile, même en le demandant.
  const doc = await page.evaluate(() => {
    const r = document.documentElement;
    window.scrollTo(0, 300);
    const y = window.scrollY;
    window.scrollTo(0, 0);
    return { h: r.getBoundingClientRect().height, sh: document.scrollingElement.scrollHeight, y, ih: innerHeight };
  });
  check(doc.h === H && doc.sh === H && doc.y === 0 && doc.ih === H, `page à la hauteur exacte de l’écran, sans défilement (${doc.h}, ${doc.sh}, ${doc.y})`);
  await unlock(page);
  await sleep(1500);
  await shot('02-carte');
  const bands = await page.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.getElementById('app')).backgroundColor]);
  check(bands[1] === BAND, PLEIN ? 'bande du bas d’iOS au gris clair du fond' : 'sur la carte, bande de l’heure en gris foncé');
  const mapR = await rect('#map');
  check(mapR.top === 0 && mapR.bottom === H, 'carte sur toute la hauteur de l’écran');
  check((await rect('.map-search')).top === TOP + 10, 'recherche placée sous l’heure et la batterie');
  check(Math.abs((await rect('.map-scrim')).height - TOP) < 1, TOP ? 'voile sous l’heure pour la lisibilité' : 'pas de voile quand iOS garde sa bande');
  const tb = await rect('#tabbar');
  check(tb.bottom === H - GAP && tb.left === 12 && tb.right === 378, `barre d’onglets flottante, en bas, à ${GAP} px du bord`);
  // Fond de carte opaque (comme les plans IGN sur l'iPhone) : la barre doit rester visible par-dessus.
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.id = 'faux-fond';
    d.style.cssText = 'position:absolute;left:-3000px;top:-3000px;width:9000px;height:9000px;background:rgb(255,0,0)';
    document.querySelector('.leaflet-tile-pane').appendChild(d);
  });
  await sleep(200);
  const b64 = await page.screenshot({ clip: { x: 300, y: tb.top + 31, width: 1, height: 1 }, encoding: 'base64', captureBeyondViewport: false });
  const rgb = await page.evaluate(async (b) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    return [...x.getImageData(0, 0, 1, 1).data];
  }, b64);
  const red = rgb[0] > 200 && rgb[1] < 80 && rgb[2] < 80;
  await shot('02b-carte-fond-opaque');
  check(red === false, 'barre d’onglets visible au-dessus d’un fond de carte opaque');
  await page.evaluate(() => document.getElementById('faux-fond').remove());
  await page.evaluate(() => __app.nav.goTab('contacts'));
  await sleep(500);
  await shot('03-contacts');
  check((await page.$eval('#app', (e) => getComputedStyle(e).backgroundColor)) === (PLEIN ? BAND : 'rgb(29, 78, 216)'), PLEIN ? 'hors carte, bande du bas toujours au gris clair du fond' : 'hors carte, bande de l’heure de la couleur de la barre du haut');
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
  const hauteur = await page.$eval('#tab-bord [data-hauteur]', (e) => e.textContent).catch(() => '');
  check(hauteur === `Hauteur d’écran utilisée : ${H} sur ${H} points`, `hauteur utilisée affichée en bas du tableau de bord (${hauteur})`);
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
  const th2 = await page.evaluate(() => [document.documentElement.dataset.theme, getComputedStyle(document.getElementById('boot')).backgroundImage]);
  check(th2[0] === 'bordeaux' && /123, 30, 51/.test(th2[1]), 'au redémarrage, le thème s’affiche dès l’écran de chargement');
  await unlock(page);
  const sh = await rect('#tabbar');
  check(sh.bottom === H - GAP, 'barre toujours en place après redémarrage');
} catch (e) {
  console.error('ÉCHEC', e);
  await shot('zz-echec');
  process.exitCode = 1;
} finally {
  console.log(logs.length ? logs.join('\n') : 'Aucune erreur console');
  await stop();
}
