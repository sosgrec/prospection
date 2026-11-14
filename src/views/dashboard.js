// Onglet Tableau de bord : objectifs, îlots prioritaires, statistiques, bilan PDF et paramètres.
import { icon } from '../icons.js';
import { esc, fmtPct, fmtNum, fmtDate, fmtDayShort, fmtMonthShort, fmtMonth, fmtAgo, startOfMonth, addMonths, plural } from '../util.js';
import { $, dialog, toast, confirmDialog, copyText } from '../ui.js';
import { S, onChange, getSetting, setSetting, restoreContact, purgeContact, saveScenario, purgeScenario, contactDisplay, resetDvfHints, contactsSansAccord, aNettoyer, nettoyer, dernierEchange, RETENTION_ANS } from '../state.js';
import {
  GOAL_DOORS,
  GOAL_MANDATS,
  DAYS,
  SLOTS,
  doorsThisWeek,
  doorsToday,
  mandatsThisMonth,
  weeklyDoors,
  monthlyMandats,
  openGrid,
  scenarioStats,
  ilotStats,
  priorities,
  suggestions,
} from '../stats.js';
import { exportBackup, restoreFromFile, backupAgeDays, hasBackupPassword, backupPassword, askNewBackupPassword } from '../backup.js';
import * as lock from '../lock.js';
import { openMentionPage, mentionReady } from './mention.js';
import { updateDvf } from '../dvfUpdate.js';
import { storageInfo, requestPersistence } from '../db.js';
import { fitIlot, reloadDvf } from './map.js';
import { nav } from '../nav.js';

let heatIlot = 0;
let showAllPrio = false;

function barChart(data, { goal, label, height = 150 }) {
  const W = 340;
  const H = height;
  const pl = 6;
  const pr = 6;
  const pt = 16;
  const pb = 20;
  const max = Math.max(goal ? goal * 1.15 : 0, ...data.map((d) => d.count), 1);
  const iw = W - pl - pr;
  const ih = H - pt - pb;
  const bw = iw / data.length;
  const bars = data
    .map((d, i) => {
      const h = (d.count / max) * ih;
      const x = pl + i * bw + bw * 0.16;
      const y = pt + ih - h;
      const ok = goal && d.count >= goal;
      return `<rect class="bar ${ok ? 'ok' : ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.68).toFixed(1)}" height="${Math.max(h, 0).toFixed(1)}" rx="2"></rect>
        ${d.count ? `<text class="val" x="${(x + bw * 0.34).toFixed(1)}" y="${(y - 3).toFixed(1)}" text-anchor="middle">${d.count}</text>` : ''}
        ${i % 2 === (data.length - 1) % 2 ? `<text x="${(x + bw * 0.34).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(label(d))}</text>` : ''}`;
    })
    .join('');
  const gy = goal ? pt + ih - (goal / max) * ih : null;
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img">${bars}${goal ? `<line class="goal" x1="${pl}" x2="${W - pr}" y1="${gy}" y2="${gy}"></line><text x="${W - pr}" y="${gy - 3}" text-anchor="end" style="fill:#dc2626">objectif ${goal}</text>` : ''}</svg></div>`;
}

function heatmap(grid) {
  const rows = DAYS.map((d, i) => ({ d, i, cells: grid[i] })).filter((r) => r.i < 6 || r.cells.some((c) => c.n));
  return `<div class="tbl-wrap"><table class="heat"><thead><tr><th></th>${SLOTS.map((s) => `<th>${s.label}</th>`).join('')}</tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr><th class="rowh">${r.d}</th>${r.cells
          .map((c) => {
            if (!c.n) return '<td style="background:#f3f4f6;color:#c3c8cf">·</td>';
            const rate = c.open / c.n;
            const alpha = c.n < 3 ? 0.08 : 0.12 + rate * 0.75;
            const dark = c.n >= 3 && rate > 0.45;
            return `<td style="background:rgba(29,78,216,${alpha.toFixed(2)});color:${dark ? '#fff' : '#1f2937'}">${c.n < 3 ? '<span style="opacity:.6">' : ''}${Math.round(rate * 100)} %<br><span style="font-weight:400;font-size:10px">${c.n} p.</span>${c.n < 3 ? '</span>' : ''}</td>`;
          })
          .join('')}</tr>`,
    )
    .join('')}</tbody></table></div>`;
}

function kpiHTML() {
  const wk = doorsThisWeek();
  const md = mandatsThisMonth();
  const td = doorsToday();
  return `<div class="kpis">
    <div class="kpi"><div class="k-label">Portes cette semaine</div><div class="k-value">${wk}<small> / ${GOAL_DOORS}</small></div><div class="progress ${wk >= GOAL_DOORS ? 'done' : ''}"><span style="width:${Math.min(100, (wk / GOAL_DOORS) * 100)}%"></span></div></div>
    <div class="kpi"><div class="k-label">Mandats ce mois</div><div class="k-value">${md}<small> / ${GOAL_MANDATS}</small></div><div class="progress ${md >= GOAL_MANDATS ? 'done' : ''}"><span style="width:${Math.min(100, (md / GOAL_MANDATS) * 100)}%"></span></div></div>
    <div class="kpi"><div class="k-label">Portes aujourd’hui</div><div class="k-value">${td}</div></div>
    <div class="kpi"><div class="k-label">Contacts</div><div class="k-value">${[...S.contacts.values()].filter((c) => !c.deletedAt).length}</div></div>
  </div>`;
}

function prioHTML() {
  const pr = priorities();
  const list = showAllPrio ? pr : pr.slice(0, 3);
  return `<div class="card">${list
    .map(
      (p, i) => `<button type="button" class="prio ${i === 0 ? 'first' : ''}" data-ilot="${p.il.id}" style="width:100%;text-align:left">
      <span class="rank">${i + 1}</span>
      <span class="li-main"><span class="prio-title">${p.il.id} · ${esc(p.il.nom)}</span><span class="prio-why" style="display:block">${esc(p.why.join(' · '))}</span>
      <span class="progress" style="margin-top:6px;display:block"><span style="width:${Math.round(p.couverture * 100)}%"></span></span><span class="small muted">${fmtPct(p.couverture)} des adresses visitées</span></span>
      ${icon('chevron', 18, 'chev')}</button>`,
    )
    .join('')}
    <button type="button" class="link-btn" data-allprio>${showAllPrio ? 'Afficher les 3 premiers' : 'Voir tout le classement'}</button></div>`;
}

function statsHTML() {
  const sc = scenarioStats().filter((x) => x.presentations);
  const il = ilotStats();
  return `
    <div class="section-title">Pistes pour progresser</div>
    <div class="card"><ul class="suggest">${suggestions()
      .map((s) => `<li>${esc(s)}</li>`)
      .join('')}</ul></div>
    <div class="section-title">Taux d’ouverture par créneau</div>
    <div class="card">
      <label class="field" style="margin-bottom:10px"><select data-heat>${[`<option value="0">Tous les îlots</option>`, ...S.base.ilots.map((x) => `<option value="${x.id}" ${heatIlot === x.id ? 'selected' : ''}>${x.id} · ${esc(x.nom)}</option>`)].join('')}</select></label>
      ${heatmap(openGrid({ ilot: heatIlot }))}
      <p class="small muted" style="margin:8px 0 0">Part des portes où quelqu’un a ouvert (contact ou refus). Cases pâles : moins de 3 passages.</p>
    </div>
    <div class="section-title">Efficacité des scénarios</div>
    <div class="card">${
      sc.length
        ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Scénario</th><th class="num">Prés.</th><th class="num">Pers.</th><th class="num">Projets</th><th class="num">Mandats</th></tr></thead><tbody>${sc
            .map((x) => `<tr><td style="white-space:normal;min-width:120px">${esc(x.s.titre)}</td><td class="num">${x.presentations}</td><td class="num">${x.contacts}</td><td class="num">${x.projets}${x.tauxProjet != null ? ` <span class="muted">(${fmtPct(x.tauxProjet)})</span>` : ''}</td><td class="num">${x.mandats}</td></tr>`)
            .join('')}</tbody></table></div>`
        : '<p class="muted small" style="margin:0">Choisis un scénario quand tu enregistres un contact pour voir lequel marche le mieux.</p>'
    }</div>
    <div class="section-title">Rendement par îlot</div>
    <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Îlot</th><th class="num">Adr.</th><th class="num">Couv.</th><th class="num">Portes</th><th class="num">Ouv.</th><th class="num">Rencontres</th><th class="num">Projets</th><th class="num">Mandats</th><th class="num">Portes / mandat</th></tr></thead><tbody>${il
      .map(
        (x) =>
          `<tr><td>${x.il.id} · ${esc(x.il.nom)}</td><td class="num">${x.adresses}</td><td class="num">${fmtPct(x.couverture)}</td><td class="num">${x.portes}</td><td class="num">${x.tauxOuverture == null ? '' : fmtPct(x.tauxOuverture)}</td><td class="num">${x.contacts}</td><td class="num">${x.projets}</td><td class="num">${x.mandats}</td><td class="num">${x.portesParMandat ?? ''}</td></tr>`,
      )
      .join('')}</tbody></table></div></div>`;
}

function rgpdHTML() {
  const sans = contactsSansAccord().length;
  const n = aNettoyer();
  const old = n.contacts.length + n.passages.length;
  return `
    <div class="section-title">Données personnelles (RGPD)</div>
    <div class="card">
      <h3>${icon('shield', 18)} Accords</h3>
      <p class="small ${sans ? '' : 'muted'}" style="margin:0 ${sans ? '0 10px' : ''};${sans ? 'color:#8a5100' : ''}">${
        sans
          ? `${sans === 1 ? '1 contact a' : `${sans} contacts ont`} un téléphone ou un email sans accord noté. Demande l’accord, ou efface ces coordonnées.`
          : 'Tous tes contacts avec téléphone ou email ont un accord noté.'
      }</p>
      ${sans ? '<button type="button" class="btn btn-light btn-block btn-small" data-sansaccord>Voir la liste</button>' : ''}
    </div>
    <div class="card">
      <h3>${icon('clock', 18)} Règle des ${RETENTION_ANS} ans</h3>
      <p class="small muted" style="margin:0 0 8px">Un prospect se garde au plus ${RETENTION_ANS} ans après votre dernier échange. Les contacts avec un mandat signé ne sont pas concernés.</p>
      <p class="small" style="margin:0;${old ? 'color:#8a5100' : ''}">${
        old ? `À supprimer : ${plural(n.contacts.length, 'contact', 'contacts')} et ${plural(n.passages.length, 'passage', 'passages')}.` : 'Rien à supprimer pour l’instant.'
      }</p>
      ${old ? '<button type="button" class="btn btn-light btn-block btn-small" data-cleanup style="margin-top:10px">Voir et supprimer</button>' : ''}
    </div>
    <div class="card">
      <h3>${icon('info', 18)} Mention d’information</h3>
      <p class="small muted" style="margin:0 0 10px">Le texte qui informe la personne de ses droits, à lui montrer ou à lui envoyer quand tu notes ses coordonnées.${mentionReady() ? '' : ' Commence par y mettre ton nom.'}</p>
      <button type="button" class="btn btn-light btn-block btn-small" data-mentionpage>${mentionReady() ? 'Ouvrir' : 'Compléter'}</button>
    </div>`;
}

function securityHTML() {
  const d = lock.lockDelay();
  const opts = [
    [0, 'Immédiatement'],
    [60, 'Après 1 minute'],
    [300, 'Après 5 minutes'],
    [900, 'Après 15 minutes'],
  ];
  return `<div class="card">
      <h3>${icon('lock', 18)} Sécurité</h3>
      <p class="small muted" style="margin:0 0 10px">Tes données sont chiffrées sur ce téléphone : l’appli s’ouvre avec ton code à 6 chiffres.</p>
      <label class="field"><span>Verrouiller quand je quitte l’appli</span><select data-lockdelay>${opts.map(([v, l]) => `<option value="${v}" ${v === d ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="btn-row"><button type="button" class="btn btn-light btn-small" data-locknow>${icon('lock', 16)} Verrouiller</button><button type="button" class="btn btn-light btn-small" data-changecode>Changer le code</button></div>
    </div>`;
}

function settingsHTML(storage) {
  const age = backupAgeDays();
  const dvf = S.dvf;
  const trashC = [...S.contacts.values()].filter((c) => c.deletedAt).length;
  const trashS = [...S.scenarios.values()].filter((s) => s.deletedAt).length;
  const months = Array.from({ length: 12 }, (_, i) => addMonths(startOfMonth(), -i));
  return `
    <div class="section-title">Bilan mensuel</div>
    <div class="card">
      <label class="field"><span>Mois</span><select data-month>${months.map((m) => `<option value="${m}">${esc(fmtMonth(m))}</option>`).join('')}</select></label>
      <button type="button" class="btn btn-primary btn-block" data-pdf>${icon('pdf', 20)} Générer le bilan PDF</button>
    </div>
    <div class="section-title">Paramètres</div>
    ${securityHTML()}
    <div class="card">
      <h3>${icon('download', 18)} Sauvegarde</h3>
      <p class="small ${age == null || age > 7 ? '' : 'muted'}" style="margin:0 0 10px;${age == null || age > 7 ? 'color:#a16207' : ''}">${age == null ? 'Aucune sauvegarde pour l’instant.' : `Dernier export ${age === 0 ? "aujourd'hui" : `il y a ${plural(age, 'jour', 'jours')}`}.`} Le fichier .xlsx est protégé par ton mot de passe : il s’ouvre dans Excel une fois le mot de passe saisi. Enregistre-le dans ton Drive depuis le menu Partager.</p>
      <div class="btn-row"><button type="button" class="btn btn-primary btn-small" data-export>${icon('download', 18)} Exporter</button><button type="button" class="btn btn-light btn-small" data-restore>${icon('upload', 18)} Restaurer</button></div>
      <p class="small muted" style="margin:10px 0 0">${
        hasBackupPassword()
          ? `${icon('key', 15)} Mot de passe des sauvegardes défini. <button type="button" class="link-btn small" data-showpwd style="min-height:30px">Afficher</button> · <button type="button" class="link-btn small" data-changepwd style="min-height:30px">Changer</button>`
          : `${icon('key', 15)} Tu choisiras le mot de passe des sauvegardes au premier export.`
      }</p>
    </div>
    <div class="card">
      <h3>${icon('euro', 18)} Ventes DVF</h3>
      <p class="small muted" style="margin:0 0 10px">${dvf ? `${plural(dvf.ventes.length, 'vente', 'ventes')} dans et autour de tes îlots${dvf.annees?.length ? `, de ${dvf.annees[0]} à ${dvf.annees[dvf.annees.length - 1]}` : ''}. Données préparées le ${fmtDate(dvf.maj)}. Source : DVF, data.gouv.fr.` : 'Aucune donnée.'}</p>
      <button type="button" class="btn btn-light btn-block btn-small" data-dvf>${icon('refresh', 18)} Mise à jour DVF</button>
    </div>
    <div class="card">
      <h3>${icon('trash', 18)} Corbeille</h3>
      <p class="small muted" style="margin:0 0 10px">${trashC || trashS ? `${plural(trashC, 'contact', 'contacts')} et ${plural(trashS, 'scénario', 'scénarios')}, supprimés définitivement après 30 jours.` : 'Vide.'}</p>
      ${trashC || trashS ? `<button type="button" class="btn btn-light btn-block btn-small" data-trash>Ouvrir la corbeille</button>` : ''}
    </div>
    <div class="card">
      <h3>${icon('settings', 18)} Stockage</h3>
      <p class="small muted" style="margin:0">${
        storage?.persisted === true
          ? 'Stockage protégé : l’iPhone ne videra pas les données de l’appli de lui-même.'
          : 'Stockage non protégé par le système : fais des exports réguliers.'
      }${storage?.usage != null ? ` Espace utilisé : ${fmtNum(storage.usage / 1048576, 1)} Mo.` : ''}</p>
      <p class="small muted" style="margin:10px 0 0">Toutes tes données restent sur cet appareil. Sources : cadastre DGFiP (Etalab, licence ouverte), adresses BANO © contributeurs OpenStreetMap (ODbL), ventes DVF (DGFiP, licence ouverte), fonds de carte IGN.</p>
      <p class="small muted" style="margin:6px 0 0">Version ${esc(globalThis.APP_VERSION || '')}</p>
    </div>`;
}

export function initDashboard(root) {
  let storage = null;
  const render = () => {
    const y = root.scrollTop;
    root.innerHTML = `<div class="tab-head"><h1>Tableau de bord</h1></div>
      ${kpiHTML()}
      <div class="section-title">Îlots prioritaires</div>${prioHTML()}
      <div class="section-title">Portes par semaine</div>
      <div class="card">${barChart(weeklyDoors(12), { goal: GOAL_DOORS, label: (d) => fmtDayShort(d.start) })}</div>
      <div class="section-title">Mandats par mois</div>
      <div class="card">${barChart(monthlyMandats(12), { goal: GOAL_MANDATS, label: (d) => fmtMonthShort(d.start), height: 130 })}</div>
      ${statsHTML()}
      ${rgpdHTML()}
      ${settingsHTML(storage)}`;
    root.scrollTop = y;
  };
  // Le rendu complet est fait à l'ouverture de l'onglet, pas à chaque saisie.
  root.addEventListener('tab:show', async () => {
    storage = await storageInfo();
    render();
  });
  onChange(() => {
    if (root.classList.contains('active')) render();
  });
  root.addEventListener('change', async (e) => {
    if (e.target.matches('[data-heat]')) {
      heatIlot = +e.target.value;
      render();
    }
    if (e.target.matches('[data-lockdelay]')) {
      lock.setLockDelay(+e.target.value);
      await setSetting('lockDelay', +e.target.value);
      toast('Réglage enregistré');
    }
  });
  root.addEventListener('click', async (e) => {
    const t = e.target;
    const il = t.closest('[data-ilot]');
    if (il) return fitIlot(il.dataset.ilot);
    if (t.closest('[data-allprio]')) {
      showAllPrio = !showAllPrio;
      return render();
    }
    if (t.closest('[data-export]')) {
      try {
        await exportBackup();
      } catch (err) {
        toast('Export impossible : ' + (err.message || err));
      }
      return render();
    }
    if (t.closest('[data-restore]')) return restoreFromFile();
    if (t.closest('[data-pdf]')) {
      const btn = t.closest('[data-pdf]');
      btn.disabled = true;
      btn.textContent = 'Génération…';
      try {
        const { monthlyPdf } = await import('../pdf.js');
        await monthlyPdf(+$('[data-month]', root).value);
      } catch (err) {
        console.error(err);
        toast('PDF impossible : ' + (err.message || err));
      }
      return render();
    }
    if (t.closest('[data-dvf]')) {
      const btn = t.closest('[data-dvf]');
      btn.disabled = true;
      try {
        const r = await updateDvf((msg) => (btn.textContent = msg));
        resetDvfHints();
        reloadDvf();
        toast(r.direct ? `Ventes mises à jour (${r.annees.join(', ')})` : `Ventes rechargées : données préparées le ${fmtDate(r.data.maj)}`);
      } catch (err) {
        toast(err.message || 'Mise à jour impossible');
      }
      return render();
    }
    if (t.closest('[data-trash]')) return openTrash();
    if (t.closest('[data-sansaccord]')) {
      nav.goTab('contacts');
      return document.getElementById('tab-contacts').dispatchEvent(new CustomEvent('contacts:filtre', { detail: 'accord' }));
    }
    if (t.closest('[data-cleanup]')) return openCleanup();
    if (t.closest('[data-mentionpage]')) return openMentionPage();
    if (t.closest('[data-locknow]')) return lock.lockNow();
    if (t.closest('[data-changecode]')) {
      if (await lock.changeCode()) toast('Code modifié');
      return;
    }
    if (t.closest('[data-showpwd]')) {
      const pwd = backupPassword();
      return dialog({
        title: 'Mot de passe des sauvegardes',
        body: `<p class="pwd-show">${esc(pwd)}</p><p class="small muted" style="margin:0">Il ouvre tes fichiers de sauvegarde, dans Excel comme dans l’appli. Garde-le dans un endroit sûr.</p>`,
        buttons: [
          { label: 'Copier', value: 'copy', kind: 'light' },
          { label: 'Fermer', value: null, kind: 'primary' },
        ],
      }).then((v) => v === 'copy' && copyText(pwd, 'Mot de passe copié'));
    }
    if (t.closest('[data-changepwd]')) {
      const p = await askNewBackupPassword({ change: true });
      if (p) {
        await setSetting('backupPwd', p);
        toast('Mot de passe changé : il protégera les prochaines sauvegardes');
      }
    }
  });
}

async function openCleanup() {
  const n = aNettoyer();
  if (!n.contacts.length && !n.passages.length) return toast('Rien à supprimer');
  const ok = await dialog({
    title: `Règle des ${RETENTION_ANS} ans`,
    cls: 'tall',
    body: `<p>À supprimer définitivement de l’appli :</p>
      ${
        n.contacts.length
          ? `<div class="pick-list" style="margin:0 0 10px">${n.contacts
              .map((c) => `<div class="li"><span class="li-main"><span class="li-title">${esc(contactDisplay(c))}</span><span class="li-sub">Dernier échange le ${fmtDate(dernierEchange(c))}</span></span></div>`)
              .join('')}</div>`
          : ''
      }
      ${n.passages.length ? `<p>${plural(n.passages.length, 'passage', 'passages')} d’avant le ${fmtDate(n.limit)}.</p>` : ''}
      <p class="small muted" style="margin:0">Ce n’est pas annulable.</p>`,
    buttons: [
      { label: 'Annuler', value: false, kind: 'light' },
      { label: 'Supprimer définitivement', value: true, kind: 'danger' },
    ],
  });
  if (!ok) return;
  const r = await nettoyer(n);
  toast(`Supprimé : ${plural(r.contacts, 'contact', 'contacts')}, ${plural(r.passages, 'passage', 'passages')}`);
}

async function openTrash() {
  const cs = [...S.contacts.values()].filter((c) => c.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);
  const ss = [...S.scenarios.values()].filter((s) => s.deletedAt);
  const left = (t) => Math.max(0, 30 - Math.floor((Date.now() - t) / 86400000));
  await dialog({
    title: 'Corbeille',
    cls: 'tall',
    body: `<div data-trashlist>${[
      ...cs.map((c) => `<div class="li" style="padding:10px 0"><span class="li-main"><span class="li-title">${esc(contactDisplay(c))}</span><span class="li-sub">Contact · encore ${left(c.deletedAt)} j</span></span><button type="button" class="btn btn-light btn-small" data-rc="${c.id}">Restaurer</button><button type="button" class="icon-btn plain" data-pc="${c.id}" aria-label="Supprimer définitivement">${icon('trash', 18)}</button></div>`),
      ...ss.map((s) => `<div class="li" style="padding:10px 0"><span class="li-main"><span class="li-title">${esc(s.titre)}</span><span class="li-sub">Scénario · encore ${left(s.deletedAt)} j</span></span><button type="button" class="btn btn-light btn-small" data-rs="${s.id}">Restaurer</button><button type="button" class="icon-btn plain" data-ps="${s.id}" aria-label="Supprimer définitivement">${icon('trash', 18)}</button></div>`),
    ].join('')}</div>`,
    buttons: [{ label: 'Fermer', value: true, kind: 'primary' }],
    onOpen(b, finish) {
      b.addEventListener('click', async (e) => {
        const x = e.target.closest('button');
        if (!x) return;
        if (x.dataset.rc) {
          await restoreContact(x.dataset.rc);
          toast('Contact restauré');
        } else if (x.dataset.pc) {
          if (!(await confirmDialog('Supprimer définitivement ce contact ? Ses relances seront supprimées aussi.', { ok: 'Supprimer', danger: true }))) return;
          await purgeContact(x.dataset.pc);
        } else if (x.dataset.rs) {
          const s = S.scenarios.get(x.dataset.rs);
          s.deletedAt = null;
          await saveScenario(s);
          toast('Scénario restauré');
        } else if (x.dataset.ps) {
          if (!(await confirmDialog('Supprimer définitivement ce scénario ?', { ok: 'Supprimer', danger: true }))) return;
          await purgeScenario(x.dataset.ps);
        } else return;
        x.closest('.li')?.remove();
        if (!b.querySelector('.li')) finish(true);
      });
    },
  });
}

export { requestPersistence, nav, fmtAgo };
