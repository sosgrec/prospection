// Premier passage : démarrage, onglets, carte, feuille d'adresse.
import { start, boot, shot, tapText, tapAddress, sleep } from './harness.mjs';

const { page, logs, stop } = await start();
try {
  await boot(page);
  await shot(page, '01-carte-ensemble');
  const info = await page.evaluate(() => ({ addrs: __app.S.addrs.size, ilots: __app.S.ilots.size, dvf: __app.S.dvf?.ventes.length }));
  console.log('Données', info);
  // Zoom sur l'îlot 45
  await page.evaluate(() => {
    const il = __app.S.ilots.get(45);
    __map.fitBounds(il.ring.map(([x, y]) => [y, x]));
  });
  await shot(page, '02-ilot45');
  const id = await page.evaluate(() => [...__app.S.addrs.values()].find((a) => a.ilot === 45 && a.num === '10')?.id || [...__app.S.addrs.values()].find((a) => a.ilot === 45).id);
  await tapAddress(page, id, 18);
  await shot(page, '03-feuille-adresse');
  for (const t of ['contacts', 'relances', 'scenarios', 'bord']) {
    await page.evaluate((k) => __app.nav.goTab(k), t);
    await sleep(400);
    await shot(page, `04-onglet-${t}`);
  }
} catch (e) {
  console.error('ÉCHEC', e);
  await shot(page, 'zz-echec');
} finally {
  console.log(logs.length ? logs.join('\n') : 'Aucune erreur console');
  await stop();
}
