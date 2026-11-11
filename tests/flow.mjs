// Parcours complet : passages, contacts, immeuble, scénarios, relances, tableau de bord.
import { start, boot, shot, tapText, tapAddress, sleep, isolated } from './harness.mjs';

const { page, logs, stop } = await start();
const check = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'ÉCHEC'} ${msg}`);
  if (!cond) process.exitCode = 1;
};
const dlgBtn = (txt) => tapText(page, '.dlg-buttons button', txt);
const count = (expr) => page.evaluate(expr);

try {
  await boot(page);
  const [maisonId, immId, autreId] = await isolated(page, 45, 3);

  // 1. Absent sur une maison
  await tapAddress(page, maisonId);
  await tapText(page, '.sheet [data-pass]', 'Absent');
  check((await count(() => __app.S.passages.size)) === 1, 'passage « absent » enregistré');
  check((await page.$eval('.counter b', (e) => e.textContent)) === '1/100', 'compteur de portes à 1/100');

  // 2. Contact : nouvelle personne + scénario absent (aucun scénario encore)
  await tapText(page, '.sheet [data-pass]', 'Contact');
  await shot(page, '10-dialogue-contact');
  await dlgBtn('Enregistrer');
  await sleep(600);
  check((await count(() => __app.S.contacts.size)) === 1, 'fiche contact créée depuis le passage');
  await shot(page, '11-fiche-contact-nouvelle');
  // Remplir la fiche
  await page.type('[name="prenom"]', 'Jeanne');
  await page.type('[name="nom"]', 'Martin');
  await page.type('[name="tel"]', '06 12 34 56 78');
  await tapText(page, '.seg[data-seg="occupation"] button', 'Propriétaire');
  await page.type('[name="anneeArrivee"]', String(new Date().getFullYear() - 8));
  await tapText(page, '.seg[data-seg="interet"] button', 'Chaud');
  await shot(page, '12-fiche-contact-remplie');
  await tapText(page, '.page.in .ph-save');
  await sleep(500);
  const c1 = await page.evaluate(() => [...__app.S.contacts.values()][0]);
  check(c1.prenom === 'Jeanne' && c1.occupation === 'proprietaire' && c1.interet === 2, 'fiche contact enregistrée');
  check((await page.evaluate((id) => __app.S.addrUser.get(id)?.color ?? null, maisonId)) === null, 'pas de couleur forcée');
  await tapText(page, '.page.in .ph-close');
  await sleep(400);
  await shot(page, '13-feuille-apres-contact');
  const sheetTxt = await page.$eval('.sheet', (e) => e.textContent);
  check(sheetTxt.includes('Jeanne Martin') && sheetTxt.includes('Propriétaire'), 'la feuille montre la propriétaire');
  check(sheetTxt.includes('installé depuis 8 ans') || sheetTxt.includes('depuis 8 ans'), 'vendeur potentiel signalé (8 ans)');

  // 3. Scénario puis double présentation
  await page.evaluate(() => __app.nav.goTab('scenarios'));
  await tapText(page, '#tab-scenarios [data-new]');
  await page.type('.page.in [name="titre"]', 'Collecte de jouets');
  await page.type('.page.in [name="texte"]', 'Bonjour, nous collectons des jouets pour une association…');
  await tapText(page, '.page.in .ph-save');
  await tapText(page, '.page.in .ph-close');
  check((await count(() => __app.S.scenarios.size)) === 1, 'scénario créé');
  await page.evaluate((id) => __app.nav.showOnMap(id), maisonId);
  await sleep(700);
  await tapText(page, '.sheet [data-pass]', 'Contact');
  await page.select('.dlg [data-scen]', await page.evaluate(() => [...__app.S.scenarios.keys()][0]));
  await dlgBtn('Enregistrer');
  await sleep(400);
  check((await count(() => [...__app.S.passages.values()].filter((p) => p.scenarioId).length)) === 1, 'scénario présenté enregistré');
  await tapText(page, '.sheet [data-pass]', 'Contact');
  await page.select('.dlg [data-scen]', await page.evaluate(() => [...__app.S.scenarios.keys()][0]));
  await sleep(200);
  const warn = await page.$eval('.dlg [data-warn]', (e) => e.textContent);
  check(warn.includes('Déjà présenté'), 'alerte « déjà présenté » affichée');
  await shot(page, '14-alerte-scenario');
  await dlgBtn('Enregistrer');
  await sleep(300);
  const second = await page.evaluate(() => document.querySelectorAll('.dlg-title').length && [...document.querySelectorAll('.dlg-title')].pop().textContent);
  check(second === 'Scénario déjà présenté', 'confirmation demandée avant de représenter');
  await dlgBtn('Changer');
  await dlgBtn('Annuler');
  check((await count(() => __app.S.passages.size)) === 3, 'pas de passage en double après « Changer »');

  // 4. Refus avec « ne plus solliciter » sur une autre maison
  const autre = autreId;
  await tapAddress(page, autre);
  await tapText(page, '.sheet [data-pass]', 'Refus');
  await page.click('.dlg [data-neplus]');
  await dlgBtn('Enregistrer');
  await sleep(400);
  check((await page.evaluate((id) => __app.S.addrUser.get(id)?.color, autre)) === 'rouge', 'adresse passée en rouge (ne plus solliciter)');
  const blocked = await page.$eval('.sheet', (e) => e.textContent.includes('Ne plus solliciter'));
  check(blocked, 'passages bloqués sur cette adresse');
  await shot(page, '15-adresse-bloquee');

  // 5. Immeuble : type, étages, appartements, brouillon et demande de sauvegarde
  await tapAddress(page, immId);
  await tapText(page, '.sheet [data-act="expand"]');
  await tapText(page, '.page.in .seg[data-seg="type"] button', 'Immeuble');
  await tapText(page, '.page.in [data-act="building"]');
  await sleep(500);
  check((await page.evaluate((id) => __app.S.addrUser.get(id)?.type, immId)) === 'immeuble', 'type immeuble enregistré avant ouverture de la vue');
  await tapText(page, '.page.in [data-act="floor-up"]');
  await tapText(page, '.page.in [data-act="floor-up"]');
  const floors = await page.$$eval('.page.in .bld-row', (r) => r.length);
  check(floors === 3, 'trois niveaux (RDC, 1er, 2e)');
  // appartement au 1er
  await page.evaluate(() => [...document.querySelectorAll('.page.in .bld-row')][1].querySelector('[data-addapt]').click());
  await sleep(400);
  await page.type('.dlg [data-loc]', '1re porte à droite');
  await shot(page, '16-appartement-dialogue');
  await dlgBtn('OK');
  await page.evaluate(() => [...document.querySelectorAll('.page.in .bld-row')][1].querySelector('[data-addapt]').click());
  await sleep(400);
  await page.type('.dlg [data-loc]', '1re porte à gauche');
  await tapText(page, '.dlg [data-a="new"]');
  await sleep(600);
  await page.type('.page.in [name="prenom"]', 'Karim');
  await page.type('.page.in [name="nom"]', 'Benali');
  await tapText(page, '.page.in .seg[data-seg="occupation"] button', 'Locataire');
  await tapText(page, '.page.in .ph-save');
  await sleep(300);
  await tapText(page, '.page.in .ph-close');
  await sleep(400);
  await shot(page, '17-vue-immeuble');
  const aptTxt = await page.$$eval('.page.in .apt', (a) => a.map((x) => x.textContent.replace(/\s+/g, ' ')));
  check(aptTxt.some((t) => t.includes('Karim Benali')) && aptTxt.some((t) => t.includes('1re porte à droite')), 'appartements affichés avec occupant');
  check((await count(() => __app.S.logements.size)) === 0, 'rien enregistré avant « Enregistrer » (brouillon)');
  await tapText(page, '.page.in .ph-close');
  await sleep(300);
  check(await page.$eval('.dlg-title', (e) => e.textContent.includes('Enregistrer les modifications')), 'demande de sauvegarde à la fermeture');
  await shot(page, '18-demande-sauvegarde');
  await dlgBtn('Enregistrer');
  await sleep(500);
  check((await count(() => __app.S.logements.size)) === 2, 'deux appartements enregistrés');
  check((await count(() => [...__app.S.links.values()].filter((l) => l.logementId).length)) === 1, 'occupant lié à son appartement');
  await page.evaluate(() => document.querySelectorAll('.page.in .ph-close').forEach((b) => b.click()));
  await sleep(600);

  // 6. Relance + badge
  await page.evaluate(() => __app.nav.goTab('relances'));
  await tapText(page, '#tab-relances [data-new]');
  await sleep(300);
  await tapText(page, '.dlg .li', 'Jeanne Martin');
  await sleep(300);
  await page.evaluate(() => {
    const d = new Date();
    document.querySelector('.dlg [data-date]').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  await page.type('.dlg [data-objet]', 'Rappeler pour l’estimation');
  await dlgBtn('Enregistrer');
  await sleep(400);
  check((await count(() => __app.S.relances.size)) === 1, 'relance créée');
  check((await page.$eval('#tabbar [data-tab="relances"]', (e) => e.textContent)).includes('1'), 'badge de relance du jour');
  await shot(page, '19-relances');

  // 7. Contacts : recherche
  await page.evaluate(() => __app.nav.goTab('contacts'));
  await page.type('#tab-contacts [data-q]', 'benali');
  await sleep(200);
  check((await page.$$eval('#tab-contacts .li', (l) => l.length)) === 1, 'recherche par nom');
  await shot(page, '20-contacts-recherche');

  // 8. Filtres carte
  await page.evaluate(() => __app.nav.goTab('carte'));
  await page.evaluate(() => document.querySelector('[data-fab="filter"]').click());
  await sleep(300);
  await page.click('.dlg [data-f="absents"]');
  await dlgBtn('Appliquer');
  await sleep(500);
  await shot(page, '21-filtre-absents');
  const vis = await page.evaluate(() => document.querySelector('.filter-bar').textContent);
  check(vis.includes('Absents à repasser'), 'filtre actif affiché');

  // 9. Tableau de bord
  await page.evaluate(() => __app.nav.goTab('bord'));
  await sleep(500);
  await shot(page, '22-tableau-de-bord');
  const kp = await page.$eval('.kpi .k-value', (e) => e.textContent);
  check(kp.startsWith('4'), `compteur semaine du tableau de bord (${kp})`);
} catch (e) {
  console.error('ÉCHEC', e);
  process.exitCode = 1;
  await shot(page, 'zz-echec-flow');
} finally {
  console.log(logs.length ? logs.join('\n') : 'Aucune erreur console');
  await stop();
}
