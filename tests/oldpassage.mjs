// Anciennes visites : date modifiable, hors compteur de la semaine, suppression d'un passage.
import { start, boot, shot, tapText, tapAddress, sleep, isolated } from './harness.mjs';
const { page, logs, stop } = await start();
const check = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'ÉCHEC'} ${msg}`);
  if (!cond) process.exitCode = 1;
};
const dlgBtn = (txt) => tapText(page, '.dlg-buttons button', txt);
try {
  await boot(page);
  const [a1] = await isolated(page, 45, 1);
  await tapAddress(page, a1);
  await tapText(page, '.sheet [data-pass]', 'Contact');
  const ancien = await page.evaluate(() => {
    const d = new Date(Date.now() - 10 * 86400000);
    d.setHours(17, 30, 0, 0);
    const p = (n) => String(n).padStart(2, '0');
    const v = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T17:30`;
    const i = document.querySelector('.dlg [data-when]');
    i.value = v;
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return d.getTime();
  });
  await shot(page, '90-contact-ancienne-date');
  await dlgBtn('Enregistrer');
  await sleep(600);
  const p1 = await page.evaluate(() => [...__app.S.passages.values()][0]);
  check(Math.abs(p1.t - ancien) < 60000, 'passage enregistré à la date choisie (il y a 10 jours, 17h30)');
  check((await page.$eval('.counter b', (e) => e.textContent)) === '0/100', 'compteur de la semaine inchangé (0/100)');
  await page.evaluate(() => document.querySelector('.page.in .ph-close').click());
  await sleep(400);
  // Ancien absent depuis la feuille
  await tapText(page, '.sheet [data-act="oldpassage"]');
  await shot(page, '91-ancien-passage');
  // Par défaut : hier 18h (même semaine). On choisit une visite d'il y a 20 jours.
  await page.evaluate(() => {
    const d = new Date(Date.now() - 20 * 86400000);
    const p = (n) => String(n).padStart(2, '0');
    document.querySelector('.dlg [data-when]').value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T10:15`;
  });
  await tapText(page, '.dlg [data-r="absent"]');
  await sleep(400);
  check((await page.evaluate(() => __app.S.passages.size)) === 2, 'ancien absent ajouté');
  check((await page.$eval('.counter b', (e) => e.textContent)) === '0/100', 'toujours 0/100 cette semaine');
  // Passage du jour, puis suppression depuis l'historique
  await tapText(page, '.sheet [data-pass]', 'Absent');
  check((await page.$eval('.counter b', (e) => e.textContent)) === '1/100', 'passage du jour compté (1/100)');
  await tapText(page, '.sheet [data-act="expand"]');
  await sleep(400);
  await page.evaluate(() => document.querySelector('.page.in [data-delpass]').click());
  await sleep(300);
  await shot(page, '92-supprimer-passage');
  await dlgBtn('Supprimer');
  await sleep(400);
  check((await page.evaluate(() => __app.S.passages.size)) === 2, 'passage supprimé depuis l’historique');
  check((await page.$eval('.counter b', (e) => e.textContent)) === '0/100', 'compteur revenu à 0/100');
  const hist = await page.$eval('.page.in [data-live="history"]', (e) => e.textContent.replace(/\s+/g, ' '));
  check(hist.includes('Contact') && hist.includes('Absent'), 'historique dans l’ordre des dates');
  await shot(page, '93-historique');
} catch (e) {
  console.error('ÉCHEC', e);
  process.exitCode = 1;
  await shot(page, 'zz-echec-old');
} finally {
  console.log(logs.length ? logs.join('\n') : 'Aucune erreur console');
  await stop();
}
