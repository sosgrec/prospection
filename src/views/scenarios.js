// Onglet Scénarios : bibliothèque des prétextes de prise de contact, avec leurs résultats.
import { icon } from '../icons.js';
import { esc, fmtDate, fmtPct, plural } from '../util.js';
import { html, $, pushPage, toast, confirmDialog, emptyState, copyText } from '../ui.js';
import { S, onChange, activeScenarios, saveScenario } from '../state.js';
import { scenarioStats } from '../stats.js';
import { register } from '../nav.js';

export function openScenario(id) {
  const ex = id ? S.scenarios.get(id) : null;
  const s = ex ? { ...ex } : { titre: '', texte: '' };
  const page = pushPage({
    title: ex ? ex.titre || 'Scénario' : 'Nouveau scénario',
    save: async () => {
      const titre = $('[name="titre"]', page.body).value.trim();
      if (!titre) {
        toast('Donne un titre au scénario');
        return false;
      }
      s.titre = titre;
      s.texte = $('[name="texte"]', page.body).value;
      const saved = await saveScenario(s);
      s.id = saved.id;
      page.setTitle(titre);
      toast('Scénario enregistré');
      return true;
    },
  });
  const st = ex ? scenarioStats().find((x) => x.s.id === ex.id) : null;
  page.body.appendChild(
    html(`<form class="form" onsubmit="return false">
    <div class="card">
      <label class="field"><span>Titre</span><input name="titre" value="${esc(s.titre)}" placeholder="Ex. : collecte de jouets pour une association" /></label>
      <label class="field" style="margin:0"><span>Texte, accroche, questions à poser</span><textarea name="texte" rows="10" placeholder="Ce que tu dis à la porte, les questions pour faire parler du projet…">${esc(s.texte || '')}</textarea></label>
      <button type="button" class="btn btn-light btn-small" data-copy style="margin-top:10px">${icon('copy', 16)} Copier le texte</button>
    </div>
    ${
      st
        ? `<div class="section-title">Résultats</div><div class="card"><dl class="kv">
            <dt>Présentations</dt><dd>${st.presentations}</dd>
            <dt>Personnes</dt><dd>${st.contacts}</dd>
            <dt>Projets détectés</dt><dd>${st.projets}${st.tauxProjet != null ? ` (${fmtPct(st.tauxProjet)})` : ''}</dd>
            <dt>Mandats</dt><dd>${st.mandats}</dd>
          </dl></div>`
        : ''
    }
    ${ex ? `<div class="pad" style="margin-top:16px"><button type="button" class="btn btn-danger-light btn-block" data-del>${icon('trash', 18)} Mettre à la corbeille</button></div><p class="small muted pad">Créé le ${fmtDate(ex.createdAt)}.</p>` : ''}
  </form>`),
  );
  page.body.addEventListener('click', async (e) => {
    if (e.target.closest('[data-copy]')) return copyText($('[name="texte"]', page.body).value, 'Texte copié');
    if (e.target.closest('[data-del]')) {
      if (!(await confirmDialog('Mettre ce scénario à la corbeille ? Son historique reste dans les statistiques tant qu’il n’est pas supprimé définitivement.', { ok: 'Corbeille', danger: true }))) return;
      ex.deletedAt = Date.now();
      await saveScenario(ex);
      page.setDirty(false);
      page.close();
      toast('Scénario mis à la corbeille');
    }
  });
  if (!ex) setTimeout(() => $('[name="titre"]', page.body).focus(), 350);
}

export function initScenarios(root) {
  const render = () => {
    const list = activeScenarios();
    const st = new Map(scenarioStats().map((x) => [x.s.id, x]));
    root.innerHTML = `
      <div class="tab-head"><h1>Scénarios</h1><button type="button" class="head-btn" data-new>${icon('plus', 18)} Scénario</button></div>
      ${
        list.length
          ? `<p class="small muted" style="margin:0 16px 10px">Tes prétextes pour engager la conversation. L’appli t’alerte si tu en présentes un deux fois à la même personne.</p>
             <div class="list">${list
               .map((s) => {
                 const x = st.get(s.id);
                 return `<button type="button" class="li" data-id="${s.id}">
                   <span class="li-main"><span class="li-title">${esc(s.titre || 'Sans titre')}</span>
                   <span class="li-sub">${x && x.presentations ? `${plural(x.presentations, 'présentation', 'présentations')} · ${plural(x.projets, 'projet', 'projets')} · ${plural(x.mandats, 'mandat', 'mandats')}` : esc((s.texte || 'Jamais présenté').slice(0, 80))}</span></span>
                   ${icon('chevron', 18, 'chev')}</button>`;
               })
               .join('')}</div>`
          : emptyState('Aucun scénario pour le moment.', 'Ajoute ton premier prétexte de prise de contact, par exemple la collecte de jouets de ce mois-ci.')
      }`;
  };
  render();
  onChange((w) => {
    if (w.has('scenarios') || w.has('passages') || w.has('contacts')) render();
  });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-new]')) return openScenario(null);
    const b = e.target.closest('[data-id]');
    if (b) openScenario(b.dataset.id);
  });
}

register({ openScenario });
