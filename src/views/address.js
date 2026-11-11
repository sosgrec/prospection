// Fiche d'une adresse : aperçu rapide (feuille du bas) et fiche complète (page).
import { icon, starIcon } from '../icons.js';
import { esc, fmtDate, fmtDateTime, fmtAgo, fmtNum, formatPhone, todayStr } from '../util.js';
import { html, $, $$, openSheet, closeSheet, getSheet, pushPage, toast, confirmDialog, dialog, segHTML, bindSegs, segValue, tagsInput } from '../ui.js';
import {
  S,
  onChange,
  addr,
  addrUser,
  addrLabel,
  ilotName,
  parcelOf,
  addressColor,
  colorAuto,
  COLORS,
  SIGNALS,
  ROLES,
  OCCUPATIONS,
  RESULTS,
  isImmeuble,
  habitantsOf,
  proprietairesOf,
  linksOfAddress,
  logementsOf,
  logementColor,
  contactOfLogement,
  contactDisplay,
  contactColor,
  passagesOfAddress,
  lastPassage,
  signalsOf,
  vendeurPotentiel,
  anneesInstalle,
  saveAddrUser,
  saveLink,
  deleteLink,
  contactName,
  activeScenarios,
  deleteCustomAddress,
  probableImmeuble,
} from '../state.js';
import { nav, register } from '../nav.js';
import { recordPassage, quickButtonsHTML } from './passage.js';
import { pickContact, pickFromList } from './pickers.js';
import { selectAddress, ensureVisible, venteHTML } from './map.js';
import { choosePhoto, addPhoto, renderPhotoGrid, viewPhoto } from '../photos.js';
import { V } from '../dvfParse.js';

const allTags = () => {
  const s = new Set();
  for (const u of S.addrUser.values()) for (const t of u.tags || []) s.add(t);
  for (const c of S.contacts.values()) for (const t of c.tags || []) s.add(t);
  return [...s].sort();
};

function personRow(c, role) {
  const occ = c.occupation ? OCCUPATIONS[c.occupation] : role === 'proprio' ? ROLES.proprio : 'Statut inconnu';
  const n = anneesInstalle(c);
  return `<button type="button" class="mini-person" data-contact="${c.id}">
    <span class="dot ${contactColor(c)}"></span>
    <span class="li-main"><span class="li-title">${esc(contactDisplay(c))} ${c.interet ? starIcon(c.interet === 2, 15) : ''}</span>
    <span class="li-sub">${esc([role === 'proprio' ? ROLES.proprio : occ, c.tel ? formatPhone(c.tel) : '', vendeurPotentiel(c) ? `installé depuis ${n} ans` : '', c.mandatSigne ? 'mandat signé' : ''].filter(Boolean).join(' · '))}</span></span>
    ${icon('chevron', 18, 'chev')}
  </button>`;
}

function lastPassageText(addressId, logementId = null) {
  const p = lastPassage(addressId, logementId);
  if (!p) return 'Jamais visité';
  let n = 0;
  for (const q of passagesOfAddress(addressId).filter((x) => (x.logementId || null) === (logementId || null))) {
    if (q.result !== p.result) break;
    n++;
  }
  return `Dernier passage : ${RESULTS[p.result].toLowerCase()} ${fmtAgo(p.t)} (${fmtDateTime(p.t)})${n > 1 ? `, ${n} fois de suite` : ''}`;
}

function badgesHTML(id) {
  const col = addressColor(id);
  const u = addrUser(id);
  const out = [`<span class="pill ${col}"><span class="dot ${col}"></span>${esc(COLORS[col].label)}${u.color ? ' (choisie)' : ''}</span>`];
  for (const s of signalsOf(id)) out.push(`<span class="pill" style="background:#efe7fd;color:#5b21b6">${esc(s)}</span>`);
  for (const l of linksOfAddress(id)) {
    const c = S.contacts.get(l.contactId);
    if (vendeurPotentiel(c)) {
      out.push(`<span class="pill" style="background:#efe7fd;color:#5b21b6">Propriétaire depuis ${anneesInstalle(c)} ans</span>`);
      break;
    }
  }
  for (const t of u.tags || []) out.push(`<span class="pill info">${esc(t)}</span>`);
  return `<div class="badges">${out.join('')}</div>`;
}

function buildingSummary(id) {
  const lgs = logementsOf(id);
  const u = addrUser(id);
  const counts = {};
  for (const lg of lgs) {
    const c = logementColor(lg);
    counts[c] = (counts[c] || 0) + 1;
  }
  const order = ['vert', 'orange', 'rouge', 'gris'];
  return `<div class="card" style="margin:10px 0;background:#f7f9fc">
    <div style="display:flex;align-items:center;gap:10px">${icon('building', 26)}<div><b>${(u.etages || []).length || 0} niveau${(u.etages || []).length > 1 ? 'x' : ''} · ${lgs.length} appartement${lgs.length > 1 ? 's' : ''}</b>
    <div class="small muted">${order
      .filter((k) => counts[k])
      .map((k) => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:8px"><span class="dot ${k}"></span>${counts[k]}</span>`)
      .join('') || 'Aucun appartement saisi'}</div></div></div>
    ${u.acces ? `<p class="small" style="margin:8px 0 0">${icon('door', 16)} ${esc(u.acces)}</p>` : ''}
  </div>`;
}

// ---------- Aperçu rapide ----------
export function openAddressSheet(id) {
  const a = addr(id);
  if (!a) return;
  selectAddress(id);
  const content = html('<div></div>');
  const render = () => {
    if (!S.addrs.has(id)) return;
    const p = parcelOf(id);
    const imm = isImmeuble(id);
    const people = [...habitantsOf(id).map((c) => personRow(c, 'habitant')), ...proprietairesOf(id).map((c) => personRow(c, 'proprio'))];
    content.innerHTML = `
      <h2>${esc(addrLabel(a))}</h2>
      <div class="sheet-sub">${esc(ilotName(a.ilot))}${p ? ` · ${esc(p.label)}${p.cont ? ` · ${fmtNum(p.cont)} m²` : ''}` : ''}</div>
      ${badgesHTML(id)}
      ${imm ? buildingSummary(id) : people.length ? `<div class="mini-people">${people.join('')}</div>` : '<p class="muted small" style="margin:10px 0">Aucune personne enregistrée à cette adresse.</p>'}
      <p class="small muted" style="margin:8px 0 10px">${esc(lastPassageText(id))}${imm ? ' (entrée de l’immeuble)' : ''}</p>
      ${imm ? `<button type="button" class="btn btn-primary btn-block" data-act="building" style="margin-bottom:8px">${icon('building', 20)} Ouvrir la vue immeuble</button>` : ''}
      ${
        !imm && probableImmeuble(id)
          ? `<div class="info-box" style="display:flex;align-items:center;gap:10px;margin:0 0 10px">${icon('building', 20)}<span style="flex:1">Probablement un immeuble : ${probableImmeuble(id)} appartements vendus sur la parcelle.</span><button type="button" class="link-btn" data-act="setimm">C’est un immeuble</button></div>`
          : ''
      }
      ${quickButtonsHTML(id)}
      <div class="btn-row" style="margin-top:8px">
        <button type="button" class="btn btn-light btn-small" data-act="newcontact">${icon('userPlus', 18)} Nouveau contact</button>
        <button type="button" class="btn btn-light btn-small" data-act="expand">${icon('expand', 18)} Agrandir</button>
      </div>`;
  };
  render();
  content.addEventListener('click', async (e) => {
    const pass = e.target.closest('[data-pass]');
    if (pass) return recordPassage({ addressId: id, result: pass.dataset.pass });
    const c = e.target.closest('[data-contact]');
    if (c) return nav.openContact(c.dataset.contact);
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'building') nav.openBuilding(id);
    else if (act === 'setimm') {
      await saveAddrUser({ ...addrUser(id), id, type: 'immeuble' });
      nav.openBuilding(id);
    } else if (act === 'expand') openAddressPage(id);
    else if (act === 'newcontact') {
      if (isImmeuble(id)) {
        toast('Dans un immeuble, ajoute la personne depuis son appartement');
        return nav.openBuilding(id);
      }
      nav.newContact({ link: { addressId: id, logementId: null, role: 'habitant' } });
    }
  });
  let off = null;
  const sheet = openSheet({
    content,
    onClose: (why) => {
      off?.();
      off = null;
      if (why !== 'replaced') selectAddress(null);
    },
  });
  // Abonnement créé après l'ouverture : la fermeture de la feuille précédente ne peut pas le couper.
  off = onChange(render);
  requestAnimationFrame(() => ensureVisible(id, sheet.el.offsetHeight || 320));
}

// ---------- Fiche complète ----------
export function openAddressPage(id) {
  const a = addr(id);
  if (!a) return;
  let u = { ...addrUser(id) };
  const page = pushPage({
    title: addrLabel(a),
    save: async () => {
      const t = segValue(page.body, 'type');
      const col = segValue(page.body, 'color');
      const next = { ...addrUser(id), ...u };
      next.id = id;
      next.type = t || null;
      if (col && col !== next.color && col === 'rouge') next.colorAt = todayStr();
      next.color = col || null;
      next.signals = $$('[data-sig]:checked', page.body).map((x) => x.dataset.sig);
      next.signalAutre = $('[data-sigautre]', page.body).value.trim();
      next.tags = tags.getValues();
      next.note = $('[data-note]', page.body).value;
      const acc = $('[data-acces]', page.body);
      if (acc) next.acces = acc.value;
      await saveAddrUser(next);
      u = { ...next };
      toast('Adresse enregistrée');
      return true;
    },
  });
  const p = parcelOf(id);
  const autoCol = colorAuto(id);
  const body = html(`<div class="form">
    <div class="page-hero"><h2>${esc(addrLabel(a))}</h2><div class="muted">${esc(ilotName(a.ilot))}${p ? ` · ${esc(p.label)}${p.cont ? ` · ${fmtNum(p.cont)} m²` : ''}` : ''}</div></div>
    <div class="card">
      <div data-live="quick"></div>
    </div>
    <div class="card">
      <label class="field"><span>Type de bâtiment</span>${segHTML(
        'type',
        [
          ['', 'Non précisé'],
          ['maison', 'Maison'],
          ['immeuble', 'Immeuble'],
        ],
        u.type || '',
      )}</label>
      <div data-imm-zone></div>
      <label class="field" style="margin-bottom:0"><span>Couleur sur la carte</span>${segHTML(
        'color',
        [
          ['', `Auto`],
          ['vert', 'Vert'],
          ['orange', 'Orange'],
          ['bleu', 'Bleu'],
          ['rouge', 'Rouge'],
          ['gris', 'Gris'],
        ],
        u.color || '',
      ).replace('class="seg"', 'class="seg colors"')}</label>
      <p class="small muted" style="margin:6px 0 0">Auto : ${esc(COLORS[autoCol].label.toLowerCase())}, d’après les personnes liées. Rouge = pas de démarchage.</p>
    </div>
    <div class="section-title">Personnes</div>
    <div class="card" data-live="people"></div>
    <div class="section-title">Signaux de vente</div>
    <div class="card">
      ${Object.entries(SIGNALS)
        .map(([k, l]) => `<label class="check"><input type="checkbox" data-sig="${k}" ${(u.signals || []).includes(k) ? 'checked' : ''}/> <span>${esc(l)}</span></label>`)
        .join('')}
      <label class="field" style="margin:8px 0 0"><span>Autre signal</span><input data-sigautre value="${esc(u.signalAutre || '')}" placeholder="Ex. : volets fermés depuis des mois" /></label>
    </div>
    <div class="section-title">Photos</div>
    <div class="card">
      <div data-live="photos"></div>
      <div class="btn-row" style="margin-top:10px">
        <button type="button" class="btn btn-light btn-small" data-photo="camera">${icon('camera', 18)} Prendre une photo</button>
        <button type="button" class="btn btn-light btn-small" data-photo="pick">${icon('image', 18)} Choisir</button>
      </div>
    </div>
    <div class="section-title">Étiquettes et note</div>
    <div class="card">
      <div class="field"><span>Étiquettes</span><div data-tags></div></div>
      <label class="field" style="margin:0"><span>Note</span><textarea data-note rows="3">${esc(u.note || '')}</textarea></label>
    </div>
    <div class="section-title">Historique des passages</div>
    <div class="card" data-live="history"></div>
    <div data-live="dvf"></div>
    ${a.custom ? `<div class="pad" style="margin-top:20px"><button type="button" class="btn btn-danger-light btn-block" data-act="delete">${icon('trash', 18)} Supprimer cette adresse ajoutée</button></div>` : ''}
  </div>`);
  page.body.appendChild(body);
  const tags = tagsInput(u.tags || [], allTags());
  $('[data-tags]', body).appendChild(tags);
  bindSegs(body, (name, v) => {
    if (name === 'type') renderImm();
  });

  const renderImm = () => {
    const z = $('[data-imm-zone]', body);
    const t = segValue(body, 'type');
    const imm = t === 'immeuble' || (t === '' && isImmeuble(id));
    z.innerHTML = imm
      ? `<label class="field"><span>Accès (digicode, interphone, gardien)</span><input data-acces value="${esc(u.acces || addrUser(id).acces || '')}" /></label>
         <button type="button" class="btn btn-primary btn-block" data-act="building" style="margin-bottom:14px">${icon('building', 20)} Ouvrir la vue immeuble</button>`
      : '';
  };
  renderImm();

  const live = {
    quick: () => `${quickButtonsHTML(id)}<p class="small muted" style="margin:8px 0 0">${esc(lastPassageText(id))}</p>`,
    people: () => {
      const hs = habitantsOf(id);
      const ps = proprietairesOf(id);
      const lgs = logementsOf(id);
      const aptPeople = lgs.map((lg) => ({ lg, c: contactOfLogement(lg.id) })).filter((x) => x.c);
      return `${hs.length || ps.length ? `<div class="mini-people">${[...hs.map((c) => personRow(c, 'habitant')), ...ps.map((c) => personRow(c, 'proprio'))].join('')}</div>` : '<p class="muted small" style="margin:0 0 8px">Aucune personne liée directement à cette adresse.</p>'}
        ${aptPeople.length ? `<div class="field-label" style="margin-top:10px">Dans les appartements</div><div class="mini-people">${aptPeople.map(({ c }) => personRow(c, 'habitant')).join('')}</div>` : ''}
        <div class="btn-row" style="margin-top:10px">
          <button type="button" class="btn btn-light btn-small" data-act="newcontact">${icon('userPlus', 18)} Nouveau contact</button>
          <button type="button" class="btn btn-light btn-small" data-act="linkcontact">${icon('link', 18)} Lier un contact</button>
        </div>`;
    },
    history: () => {
      const ps = passagesOfAddress(id);
      if (!ps.length) return '<p class="muted small" style="margin:0">Aucun passage pour le moment.</p>';
      const scen = new Map(activeScenarios().map((s) => [s.id, s]));
      return `<ul class="timeline">${ps
        .slice(0, 60)
        .map((p) => {
          const c = p.contactId ? S.contacts.get(p.contactId) : null;
          const lg = p.logementId ? S.logements.get(p.logementId) : null;
          const extra = [lg ? lg.loc || 'appartement' : p.logementId ? 'appartement supprimé' : '', c ? contactName(c) : '', p.scenarioId ? `scénario « ${scen.get(p.scenarioId)?.titre || 'supprimé'} »` : '', p.note]
            .filter(Boolean)
            .join(' · ');
          return `<li><span class="t-date">${fmtDate(p.t)}<br>${new Date(p.t).toTimeString().slice(0, 5).replace(':', 'h')}</span><span><span class="res-${p.result}">${RESULTS[p.result]}</span>${extra ? ` <span class="muted">${esc(extra)}</span>` : ''}</span></li>`;
        })
        .join('')}</ul>`;
    },
    dvf: () => {
      if (!S.dvf) return '';
      const pid = parcelOf(id)?.id;
      const sales = S.dvf.ventes.filter((v) => (pid && v[V.parcelle] === pid) || (v[V.adresse] && v[V.adresse].toLowerCase() === addrLabel(a).toLowerCase()));
      if (!sales.length) return '';
      return `<div class="section-title">Ventes à cette adresse</div><div class="card">${sales.map(venteHTML).join('')}</div>`;
    },
  };
  const renderLive = () => {
    for (const [k, fn] of Object.entries(live)) {
      const z = $(`[data-live="${k}"]`, body);
      if (z) z.innerHTML = fn();
    }
    renderPhotoGrid($('[data-live="photos"]', body), id);
  };
  renderLive();
  const off = onChange(renderLive);
  const origClose = page.close;
  page.close = () => {
    off();
    origClose();
  };

  body.addEventListener('click', async (e) => {
    const pass = e.target.closest('[data-pass]');
    if (pass) return recordPassage({ addressId: id, result: pass.dataset.pass });
    const c = e.target.closest('[data-contact]');
    if (c) return nav.openContact(c.dataset.contact);
    const ph = e.target.closest('[data-ph]');
    if (ph) return viewPhoto(ph.dataset.ph);
    const photo = e.target.closest('[data-photo]');
    if (photo) {
      const f = await choosePhoto(photo.dataset.photo === 'camera');
      if (f) {
        try {
          await addPhoto(id, f);
          toast('Photo ajoutée');
        } catch {
          toast('Impossible de lire cette photo');
        }
      }
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'building') {
      if (page.dirty) {
        const ok = await page.save();
        if (!ok) return;
      }
      nav.openBuilding(id);
    } else if (act === 'newcontact') {
      if (isImmeuble(id)) {
        toast('Dans un immeuble, ajoute la personne depuis son appartement');
        return nav.openBuilding(id);
      }
      nav.newContact({ link: { addressId: id, logementId: null, role: 'habitant' } });
    } else if (act === 'linkcontact') {
      const r = await pickContact({ title: 'Lier un contact', allowNew: false, exclude: linksOfAddress(id).map((l) => l.contactId) });
      if (!r?.contactId) return;
      const role = await pickFromList({
        title: 'Rôle à cette adresse',
        items: [
          { value: 'habitant', label: 'Habitant', sub: 'Vit à cette adresse' },
          { value: 'proprio', label: 'Propriétaire non occupant', sub: 'Possède le bien sans y habiter' },
        ],
      });
      if (!role) return;
      await saveLink({ contactId: r.contactId, addressId: id, logementId: null, role });
      toast('Contact lié');
    } else if (act === 'delete') {
      if (linksOfAddress(id).length || passagesOfAddress(id).length) return toast('Retire d’abord les contacts et passages liés');
      if (!(await confirmDialog('Supprimer cette adresse ajoutée à la main ?', { ok: 'Supprimer', danger: true }))) return;
      await deleteCustomAddress(id);
      page.setDirty(false);
      page.close();
      closeSheet();
      toast('Adresse supprimée');
    }
  });
  return page;
}

register({ openAddress: openAddressSheet, openAddressPage });
