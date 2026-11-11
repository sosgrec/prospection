// Fiche contact complète : saisie, copie des champs, adresses liées, relances, historique.
import { icon, starIcon } from '../icons.js';
import { esc, fmtDate, fmtDateTime, todayStr, formatPhone, phoneKey } from '../util.js';
import { html, $, $$, pushPage, dialog, toast, confirmDialog, copyText, segHTML, bindSegs, segValue, tagsInput } from '../ui.js';
import {
  S,
  onChange,
  newContact,
  saveContact,
  trashContact,
  contactName,
  contactDisplay,
  contactAddressLinks,
  setContactLinks,
  addrLabel,
  ilotName,
  OCCUPATIONS,
  LOGEMENT_TYPES,
  ETATS,
  INTERETS,
  ROLES,
  RESULTS,
  passagesOfContact,
  relancesOfContact,
  saveRelance,
  deleteRelance,
  relanceStatus,
  findDuplicates,
  vendeurPotentiel,
  anneesInstalle,
  activeScenarios,
} from '../state.js';
import { nav, register } from '../nav.js';
import { pickAddress, pickFromList } from './pickers.js';
import { relanceDialog, addToCalendar } from './relances.js';

const allTags = () => {
  const s = new Set();
  for (const c of S.contacts.values()) for (const t of c.tags || []) s.add(t);
  for (const u of S.addrUser.values()) for (const t of u.tags || []) s.add(t);
  return [...s].sort();
};

function copyField(label, name, value, type = 'text', extra = '') {
  const isTel = type === 'tel';
  const isMail = type === 'email';
  return `<label class="field"><span>${esc(label)}</span><div class="with-actions">
    <input name="${name}" type="${type}" value="${esc(value || '')}" ${isTel ? 'inputmode="tel" autocomplete="off"' : ''} ${isMail ? 'inputmode="email" autocapitalize="none" autocomplete="off"' : ''} ${extra} />
    ${isTel ? `<button type="button" class="copy-btn call" data-call aria-label="Appeler">${icon('phone', 20)}</button>` : ''}
    ${isMail ? `<button type="button" class="copy-btn mail" data-mail aria-label="Écrire">${icon('mail', 20)}</button>` : ''}
    <button type="button" class="copy-btn" data-copy="${name}" aria-label="Copier">${icon('copy', 20)}</button>
  </div></label>`;
}

export function openContactPage(contactId, opts = {}) {
  const existing = contactId ? S.contacts.get(contactId) : null;
  const isNew = !existing || opts.isNew;
  const c = existing ? { ...existing } : newContact();
  let saved = !!existing;
  // Liens d'adresse en brouillon (hors appartements, gérés par la vue immeuble)
  let links = existing ? contactAddressLinks(c.id).map((l) => ({ ...l })) : [];
  if (!existing && opts.link) links.push({ ...opts.link, contactId: c.id });

  const page = pushPage({
    title: opts.title || (existing ? contactDisplay(existing) : 'Nouveau contact'),
    save: async () => {
      const f = read();
      // Doublons
      if (!saved || phoneKey(f.tel) !== phoneKey(S.contacts.get(c.id)?.tel) || f.nom !== S.contacts.get(c.id)?.nom || f.prenom !== S.contacts.get(c.id)?.prenom) {
        const d = findDuplicates({ ...f, id: c.id });
        if (d.length) {
          const o = d[0];
          const r = await dialog({
            title: 'Doublon possible',
            body: `<p>Un contact existe déjà avec le ${esc(o.why)} : <b>${esc(contactDisplay(o.contact))}</b>.</p>`,
            buttons: [
              { label: 'Enregistrer quand même', value: 'save', kind: 'primary' },
              { label: 'Ouvrir l’existant', value: 'open', kind: 'light' },
              { label: 'Annuler', value: null, kind: 'light' },
            ],
          });
          if (r === 'open') {
            page.setDirty(false);
            page.close();
            openContactPage(o.contact.id);
            return false;
          }
          if (r !== 'save') return false;
        }
      }
      Object.assign(c, f);
      await saveContact(c);
      const dirLinks = links.filter((l) => !l.logementId);
      await setContactLinks(c.id, dirLinks);
      links = contactAddressLinks(c.id).map((l) => ({ ...l }));
      const first = !saved;
      saved = true;
      page.setTitle(contactDisplay(c));
      toast('Contact enregistré');
      if (first) opts.onSaved?.(c);
      renderLinks();
      return true;
    },
    onClose: () => off?.(),
  });

  const body = html(`<form class="form" autocomplete="off" onsubmit="return false">
    <div class="card">
      <div class="grid2">
        <label class="field"><span>Prénom</span><input name="prenom" value="${esc(c.prenom || '')}" autocapitalize="words" /></label>
        <label class="field"><span>Nom</span><input name="nom" value="${esc(c.nom || '')}" autocapitalize="words" /></label>
      </div>
      <div class="btn-row" style="margin:-4px 0 14px"><button type="button" class="btn btn-light btn-small" data-copyname>${icon('copy', 16)} Copier le nom</button></div>
      ${copyField('Téléphone', 'tel', c.tel, 'tel')}
      ${copyField('Email', 'email', c.email, 'email')}
    </div>
    <div class="section-title">Statut</div>
    <div class="card">
      <label class="field"><span>Occupation</span>${segHTML(
        'occupation',
        [
          ['', 'Inconnu'],
          ['proprietaire', 'Propriétaire'],
          ['locataire', 'Locataire'],
        ],
        c.occupation || '',
      )}</label>
      <label class="field" style="margin-bottom:6px"><span>Année d’arrivée dans le logement</span><input name="anneeArrivee" type="number" inputmode="numeric" min="1950" max="2100" value="${esc(c.anneeArrivee || '')}" placeholder="Ex. : 2017" /></label>
      <div data-vendeur></div>
    </div>
    <div class="section-title">Logement</div>
    <div class="card">
      <label class="field"><span>Type</span><select name="logType"><option value="">Non renseigné</option>${LOGEMENT_TYPES.map((t) => `<option ${c.logType === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <div class="grid2">
        <label class="field"><span>Surface (m²)</span><input name="surface" type="number" inputmode="decimal" value="${esc(c.surface || '')}" /></label>
        <label class="field"><span>Pièces</span><input name="pieces" type="number" inputmode="numeric" value="${esc(c.pieces || '')}" /></label>
      </div>
      <label class="field" style="margin:0"><span>État</span><select name="etat"><option value="">Non renseigné</option>${ETATS.map((t) => `<option ${c.etat === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    </div>
    <div class="section-title">Projet</div>
    <div class="card">
      <label class="field"><span>Intérêt</span>${segHTML(
        'interet',
        INTERETS.map((l, i) => [String(i), l]),
        String(c.interet || 0),
      )}</label>
      <label class="field"><span>Projet immobilier</span><div class="with-actions" style="align-items:flex-start"><textarea name="projet" rows="3" style="flex:1" placeholder="Vente, achat, délai, budget…">${esc(c.projet || '')}</textarea><button type="button" class="copy-btn" data-copy="projet">${icon('copy', 20)}</button></div></label>
      <label class="check"><input type="checkbox" name="mandatSigne" ${c.mandatSigne ? 'checked' : ''}/> <span><b>Mandat signé</b></span></label>
      <label class="field" data-mandatdate style="margin:6px 0 0;${c.mandatSigne ? '' : 'display:none'}"><span>Date de signature</span><input name="mandatDate" type="date" value="${esc(c.mandatDate || todayStr())}" /></label>
    </div>
    <div class="section-title">Adresses</div>
    <div class="card" data-links></div>
    <div class="section-title">Remarques</div>
    <div class="card">
      <div class="with-actions" style="align-items:flex-start"><textarea name="remarques" rows="4" style="flex:1;min-height:100px;border:1px solid #d6dae0;border-radius:11px;padding:11px 12px;font-size:16px">${esc(c.remarques || '')}</textarea><button type="button" class="copy-btn" data-copy="remarques">${icon('copy', 20)}</button></div>
      <div class="field" style="margin:14px 0 0"><span>Étiquettes</span><div data-tags></div></div>
    </div>
    <div class="section-title">Relances</div>
    <div class="card" data-relances></div>
    <div class="section-title">Refus</div>
    <div class="card">
      <label class="field"><span>Notes de refus</span><textarea name="refusNote" rows="2">${esc(c.refusNote || '')}</textarea></label>
      <label class="check"><input type="checkbox" name="nePlusSolliciter" ${c.nePlusSolliciter ? 'checked' : ''}/> <span><b>Ne plus solliciter</b><br><span class="small muted">La personne l’a demandé. Son adresse passe en rouge et l’appli bloque les passages.</span></span></label>
    </div>
    <div class="section-title">Historique</div>
    <div class="card" data-history></div>
    <div class="pad" style="margin-top:18px"><button type="button" class="btn btn-danger-light btn-block" data-delete>${icon('trash', 18)} Mettre à la corbeille</button></div>
    <p class="small muted pad" style="margin-top:10px">${existing ? `Créé le ${fmtDate(existing.createdAt)}${existing.updatedAt ? `, modifié le ${fmtDate(existing.updatedAt)}` : ''}.` : ''}</p>
  </form>`);
  page.body.appendChild(body);
  const tags = tagsInput(c.tags || [], allTags());
  $('[data-tags]', body).appendChild(tags);
  bindSegs(body);

  const val = (n) => body.querySelector(`[name="${n}"]`);
  function read() {
    const num = (v) => (v === '' || v == null ? null : Number(v));
    const nePlus = val('nePlusSolliciter').checked;
    return {
      prenom: val('prenom').value.trim(),
      nom: val('nom').value.trim(),
      tel: val('tel').value.trim(),
      email: val('email').value.trim(),
      occupation: segValue(body, 'occupation') || null,
      anneeArrivee: num(val('anneeArrivee').value),
      logType: val('logType').value,
      surface: num(val('surface').value),
      pieces: num(val('pieces').value),
      etat: val('etat').value,
      interet: Number(segValue(body, 'interet') || 0),
      projet: val('projet').value,
      mandatSigne: val('mandatSigne').checked,
      mandatDate: val('mandatSigne').checked ? val('mandatDate').value || todayStr() : null,
      remarques: val('remarques').value,
      refusNote: val('refusNote').value,
      nePlusSolliciter: nePlus,
      nePlusDate: nePlus ? c.nePlusDate || todayStr() : null,
      tags: tags.getValues(),
    };
  }

  const renderVendeur = () => {
    const tmp = { occupation: segValue(body, 'occupation'), anneeArrivee: val('anneeArrivee').value };
    const n = anneesInstalle(tmp);
    $('[data-vendeur]', body).innerHTML = vendeurPotentiel(tmp)
      ? `<span class="pill" style="background:#efe7fd;color:#5b21b6">Installé depuis ${n} ans : vendeur potentiel</span>`
      : n != null && n >= 0
        ? `<span class="small muted">Installé depuis ${n} an${n > 1 ? 's' : ''}.</span>`
        : '';
  };
  renderVendeur();

  function renderLinks() {
    const z = $('[data-links]', body);
    const rows = links.map((l, i) => {
      const lg = l.logementId ? S.logements.get(l.logementId) : null;
      return `<div class="mini-person" style="cursor:default">
        <span class="li-main"><button type="button" class="li-title" data-goaddr="${esc(l.addressId)}" style="color:var(--accent)">${esc(addrLabel(l.addressId))}</button>
        <span class="li-sub">${esc(ilotName(S.addrs.get(l.addressId)?.ilot))}${lg ? ` · appartement : ${esc(lg.loc || 'sans localisation')}` : ''}</span></span>
        ${
          l.logementId
            ? `<span class="pill gris">Occupant</span>`
            : `<select data-role="${i}" class="input" style="width:auto;min-height:38px;padding:6px 30px 6px 10px;font-size:14px" data-nodirty>${Object.entries(ROLES)
                .map(([k, v]) => `<option value="${k}" ${l.role === k ? 'selected' : ''}>${k === 'proprio' ? 'Propriétaire' : v}</option>`)
                .join('')}</select>
               <button type="button" class="icon-btn plain" data-unlink="${i}" aria-label="Retirer">${icon('close', 18)}</button>`
        }
      </div>`;
    });
    z.innerHTML = `${rows.length ? `<div class="mini-people" style="margin:0">${rows.join('')}</div>` : '<p class="muted small" style="margin:0 0 8px">Aucune adresse liée.</p>'}
      <button type="button" class="btn btn-light btn-small" data-addlink style="margin-top:8px">${icon('link', 18)} Lier une adresse</button>`;
  }
  renderLinks();

  function renderRelances() {
    const z = $('[data-relances]', body);
    const rs = saved ? relancesOfContact(c.id) : [];
    const lbl = { retard: 'En retard', jour: "Aujourd'hui", avenir: 'À venir', faite: 'Faite' };
    z.innerHTML = `${
      rs.length
        ? `<div class="mini-people" style="margin:0">${rs
            .map(
              (r) => `<div class="mini-person" style="cursor:default">
          <span class="li-main"><span class="li-title">${fmtDate(r.date)}${r.heure ? ` à ${esc(r.heure)}` : ''} <span class="pill ${r.done ? 'gris' : relanceStatus(r) === 'retard' ? 'rouge' : 'info'}" style="font-size:11px;padding:1px 7px">${lbl[relanceStatus(r)]}</span></span>
          <span class="li-sub" style="white-space:normal">${esc(r.objet || 'Relance')}</span></span>
          ${r.done ? '' : `<button type="button" class="icon-btn plain" data-cal="${r.id}" aria-label="Calendrier">${icon('calendar', 20)}</button><button type="button" class="icon-btn plain" data-done="${r.id}" aria-label="Faite">${icon('check', 20)}</button>`}
          <button type="button" class="icon-btn plain" data-delrel="${r.id}" aria-label="Supprimer">${icon('trash', 18)}</button>
        </div>`,
            )
            .join('')}</div>`
        : '<p class="muted small" style="margin:0 0 8px">Aucune relance.</p>'
    }<button type="button" class="btn btn-light btn-small" data-addrel style="margin-top:8px">${icon('plus', 18)} Ajouter une relance</button>`;
  }
  function renderHistory() {
    const z = $('[data-history]', body);
    const ps = saved ? passagesOfContact(c.id) : [];
    const scen = new Map([...S.scenarios.values()].map((s) => [s.id, s]));
    z.innerHTML = ps.length
      ? `<ul class="timeline">${ps
          .map(
            (p) =>
              `<li><span class="t-date">${fmtDate(p.t)}</span><span><span class="res-${p.result}">${RESULTS[p.result]}</span> <span class="muted">${esc(
                [addrLabel(p.addressId), p.scenarioId ? `scénario « ${scen.get(p.scenarioId)?.titre || 'supprimé'} »` : '', p.note].filter(Boolean).join(' · '),
              )}</span></span></li>`,
          )
          .join('')}</ul>`
      : '<p class="muted small" style="margin:0">Aucun passage avec cette personne.</p>';
  }
  renderRelances();
  renderHistory();
  const off = onChange((w) => {
    if (w.has('relances')) renderRelances();
    if (w.has('passages') || w.has('scenarios')) renderHistory();
  });

  body.addEventListener('change', (e) => {
    if (e.target.name === 'mandatSigne') $('[data-mandatdate]', body).style.display = e.target.checked ? '' : 'none';
    if (e.target.name === 'nePlusSolliciter' && e.target.checked) toast('Pense à enregistrer : l’adresse passera en rouge');
    if (e.target.matches('[data-role]')) {
      links[+e.target.dataset.role].role = e.target.value;
      page.setDirty(true);
    }
    renderVendeur();
  });
  body.addEventListener('input', (e) => {
    if (e.target.name === 'anneeArrivee') renderVendeur();
  });
  body.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('.seg[data-seg="occupation"]')) setTimeout(renderVendeur);
    const cp = t.closest('[data-copy]');
    if (cp) return copyText(val(cp.dataset.copy).value, 'Copié');
    if (t.closest('[data-copyname]')) return copyText([val('prenom').value, val('nom').value].filter(Boolean).join(' '), 'Nom copié');
    if (t.closest('[data-call]')) {
      const n = phoneKey(val('tel').value);
      if (n) location.href = `tel:${n}`;
      return;
    }
    if (t.closest('[data-mail]')) {
      const m = val('email').value.trim();
      if (m) location.href = `mailto:${m}`;
      return;
    }
    const go = t.closest('[data-goaddr]');
    if (go) {
      if (page.dirty) {
        const ok = await page.requestClose();
        if (!ok) return;
      } else page.close();
      return nav.showOnMap(go.dataset.goaddr);
    }
    const ul = t.closest('[data-unlink]');
    if (ul) {
      links.splice(+ul.dataset.unlink, 1);
      page.setDirty(true);
      return renderLinks();
    }
    if (t.closest('[data-addlink]')) {
      const id = await pickAddress({ title: 'Lier une adresse' });
      if (!id) return;
      const role = await pickFromList({
        title: 'Rôle à cette adresse',
        items: [
          { value: 'habitant', label: 'Habitant', sub: 'Vit à cette adresse' },
          { value: 'proprio', label: 'Propriétaire non occupant', sub: 'Possède le bien sans y habiter' },
        ],
      });
      if (!role) return;
      links.push({ contactId: c.id, addressId: id, logementId: null, role });
      page.setDirty(true);
      return renderLinks();
    }
    if (t.closest('[data-addrel]')) {
      if (!saved || page.dirty) {
        const ok = await page.save();
        if (!ok) return;
      }
      const cur = S.contacts.get(c.id);
      if (cur?.nePlusSolliciter && !(await confirmDialog('Cette personne a demandé à ne plus être sollicitée. Ajouter quand même une relance ?', { ok: 'Ajouter' }))) return;
      const r = await relanceDialog({ contactId: c.id });
      if (r) await saveRelance(r);
      return;
    }
    const done = t.closest('[data-done]');
    if (done) {
      const r = S.relances.get(done.dataset.done);
      r.done = true;
      r.doneAt = Date.now();
      await saveRelance(r);
      return toast('Relance faite', { action: 'Annuler', onAction: () => saveRelance({ ...r, done: false, doneAt: null }) });
    }
    const cal = t.closest('[data-cal]');
    if (cal) return addToCalendar(S.relances.get(cal.dataset.cal));
    const dr = t.closest('[data-delrel]');
    if (dr) {
      if (await confirmDialog('Supprimer cette relance ?', { ok: 'Supprimer', danger: true })) await deleteRelance(dr.dataset.delrel);
      return;
    }
    if (t.closest('[data-delete]')) {
      if (!saved) {
        page.setDirty(false);
        return page.close();
      }
      if (!(await confirmDialog(`Mettre ${contactName(c)} à la corbeille ? Tu pourras la restaurer pendant 30 jours depuis le Tableau de bord.`, { ok: 'Mettre à la corbeille', danger: true }))) return;
      await trashContact(c.id);
      page.setDirty(false);
      page.close();
      toast('Contact mis à la corbeille');
    }
  });
  if (isNew) setTimeout(() => val('prenom').focus(), 350);
  return page;
}

register({
  openContact: (id, opts) => openContactPage(id, opts),
  newContact: (opts = {}) => openContactPage(null, opts),
});
