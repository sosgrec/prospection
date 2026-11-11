// Bouton « Mise à jour DVF » : le site officiel est injoignable ici, l'appli doit recharger sa copie.
import { start, boot, tapText, sleep, shot } from './harness.mjs';
const { page, logs, stop } = await start();
try {
  await boot(page);
  await page.evaluate(() => __app.nav.goTab('bord'));
  await sleep(500);
  await tapText(page, '#tab-bord [data-dvf]');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('Ventes'), { timeout: 60000 });
  console.log('Message :', await page.$eval('.toast', (e) => e.textContent));
  console.log('Carte DVF :', await page.$eval('[data-dvf]', (e) => e.closest('.card').querySelector('p').textContent));
  await shot(page, '80-maj-dvf');
} catch (e) {
  console.error('ÉCHEC', e);
  process.exitCode = 1;
} finally {
  console.log(logs.length ? logs.join('\n') : 'Aucune erreur console');
  await stop();
}
