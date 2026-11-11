// Captures d'écran des vues secondaires, pour relecture visuelle.
import { start, boot, shot, tapText, tapAddress, sleep, isolated } from './harness.mjs';

const { page, logs, stop } = await start();
const dlgBtn = (txt) => tapText(page, '.dlg-buttons button', txt);
try {
  await boot(page);
  await shot(page, '50-demarrage');
  // Quelques données
  const ids = await isolated(page, 68, 8);
  for (const [i, id] of ids.entries()) {
    await tapAddress(page, id);
    await tapText(page, '.sheet [data-pass]', i < 5 ? 'Absent' : 'Contact');
    if (i >= 5) {
      await dlgBtn('Enregistrer');
      await sleep(500);
      await page.type('.page.in [name="prenom"]', ['Paul', 'Inès', 'Marc'][i - 5]);
      await page.type('.page.in [name="nom"]', ['Leroy', 'Garcia', 'Petit'][i - 5]);
      await tapText(page, '.page.in .seg[data-seg="occupation"] button', i % 2 ? 'Propriétaire' : 'Locataire');
      await tapText(page, '.page.in .seg[data-seg="interet"] button', i === 6 ? 'Chaud' : 'Tiède');
      await tapText(page, '.page.in .ph-save');
      await tapText(page, '.page.in .ph-close');
    }
  }
  await page.evaluate((id) => {
    const a = __app.S.addrs.get(id);
    __map.setView([a.lat, a.lon], 17, { animate: false });
    document.querySelector('.sheet-close')?.click();
  }, ids[3]);
  await shot(page, '51-carte-couleurs-z17');
  await page.evaluate(() => __map.setZoom(19));
  await shot(page, '52-carte-z19');
  // Parcelle sans adresse
  const pt = await page.evaluate(() => {
    const s = __app.S;
    const used = new Set([...s.addrs.values()].flatMap((a) => a.parcels));
    const i = s.base.parcelles.findIndex((p, k) => p[2] === 68 && !used.has(k));
    const r = s.base.parcelles[i][3][0];
    const c = r.reduce((m, [x, y]) => [m[0] + x / r.length, m[1] + y / r.length], [0, 0]);
    __map.setView([c[1], c[0]], 19, { animate: false });
    const p = __map.latLngToContainerPoint([c[1], c[0]]);
    const b = document.getElementById('map').getBoundingClientRect();
    return { x: b.left + p.x, y: b.top + p.y };
  });
  await sleep(400);
  await page.touchscreen.tap(pt.x, pt.y);
  await sleep(500);
  await shot(page, '53-parcelle');
  // Adresses superposées
  const dup = await page.evaluate(() => {
    const all = [...__app.S.addrs.values()];
    const d = (a, b) => Math.hypot((a.lon - b.lon) * 73300, (a.lat - b.lat) * 110540);
    const a = all.find((x) => all.some((y) => y !== x && d(x, y) < 4));
    return a?.id;
  });
  if (dup) {
    await tapAddress(page, dup, 18);
    await shot(page, '54-choix-adresses');
  }
  // Panneaux de la carte
  await page.evaluate(() => document.querySelector('.sheet-close')?.click());
  await page.evaluate(() => document.querySelector('[data-fab="filter"]').click());
  await sleep(300);
  await shot(page, '55-filtres');
  await dlgBtn('Appliquer');
  await page.evaluate(() => document.querySelector('[data-fab="layers"]').click());
  await sleep(300);
  await shot(page, '56-fonds');
  await dlgBtn('Fermer');
  await page.evaluate(() => document.querySelector('.map-search').click());
  await sleep(300);
  await page.type('.dlg input', 'paul');
  await sleep(300);
  await shot(page, '57-recherche');
  await dlgBtn('Fermer');
  // Onglets
  await page.evaluate(() => __app.nav.goTab('relances'));
  await shot(page, '58-relances-absents');
  await page.evaluate(() => __app.nav.goTab('contacts'));
  await shot(page, '59-contacts');
  await page.evaluate(() => __app.nav.goTab('bord'));
  await sleep(300);
  await page.evaluate(() => document.querySelector('#tab-bord').scrollTo(0, 1500));
  await shot(page, '60-bord-stats');
  await page.evaluate(() => document.querySelector('#tab-bord').scrollTo(0, 3200));
  await shot(page, '61-bord-parametres');
  // Fiche contact en haut
  await page.evaluate(() => __app.nav.openContact([...__app.S.contacts.values()][0].id));
  await sleep(500);
  await shot(page, '62-fiche-contact-haut');
} catch (e) {
  console.error('ÉCHEC', e);
  await shot(page, 'zz-echec-views');
} finally {
  console.log(logs.length ? logs.join('\n') : 'Aucune erreur console');
  await stop();
}
