// Vue immeuble : un étage par ligne, un compartiment par appartement.
// Tout changement de structure reste en brouillon jusqu'à « Enregistrer ».
import { icon, starIcon } from '../icons.js';
import { esc, uid, fmtDayShort, formatPhone } from '../util.js';
import { html, $, pushPage, dialog, confirmDialog, toast, segHTML, bindSegs } from '../ui.js';
import {
  S,
  onChange,
  addr,
  addrUser,
  addrLabel,
  logementsOf,
  idx,
  contactColor,
  contactDisplay,
  OCCUPATIONS,
  RESULTS,
  lastPassage,
  saveBuilding,
  contactName,
} from '../state.js';
import { nav, register } from '../nav.js';
import { recordPassage, recordOldPassage, blockedHTML } from './passage.js';
import { pickContact } from './pickers.js';

const autoLabel = (i) => (i === 0 ? 'RDC' : i === 1 ? '1er' : `${i}e`);
const clone = (o) => JSON.parse(JSON.stringify(o));

export function openBuilding(addressId) {
  const a = addr(addressId);
  if (!a) return;
  // ---------- Brouillon ----------
  const user = clone(addrUser(addressId));
  user.id = addressId;
  if (!user.etages?.length) user.etages = [{ id: uid(), label: 'RDC' }];
  const logements = clone(logementsOf(addressId));
  const lgLinks = new Map(); // logementId → lien habitant
  for (const lg of logements) {
    const l = idx().linkByLogement.get(lg.id);
    if (l) lgLinks.set(lg.id, clone(l));
  }
  const deletedLogementIds = new Set();
  const deletedLinkIds = new Set();
  const savedLinkIds = new Set([...lgLinks.values()].map((l) => l.id));

  const contactOf = (lgId) => {
    const l = lgLinks.get(lgId);
    return l ? S.contacts.get(l.contactId) || null : null;
  };
  const colorOf = (lg) => {
    if (lg.color) return lg.color;
    if (user.color === 'rouge') return 'rouge';
    return contactColor(contactOf(lg.id));
  };
  const blockedOf = (lg) => {
    if (lg.color === 'rouge' || user.color === 'rouge') return { by: 'logement' };
    const c = contactOf(lg.id);
    return c?.nePlusSolliciter ? { by: 'contact', contact: c, date: c.nePlusDate } : null;
  };
  const setLink = (lgId, contactId) => {
    const old = lgLinks.get(lgId);
    if (old && old.contactId === contactId) return;
    if (old && savedLinkIds.has(old.id)) deletedLinkIds.add(old.id);
    if (contactId) lgLinks.set(lgId, { id: uid(), contactId, addressId, logementId: lgId, role: 'habitant' });
    else lgLinks.delete(lgId);
    page.setDirty(true);
    render();
  };

  const page = pushPage({
    title: `Immeuble · ${addrLabel(a)}`,
    cls: 'page-building',
    save: async () => {
      user.type = 'immeuble';
      user.acces = $('[data-acces]', page.body)?.value ?? user.acces;
      const keepLinks = [...lgLinks.values()].filter((l) => !deletedLogementIds.has(l.logementId));
      for (const id of deletedLogementIds) {
        const l = [...S.links.values()].find((x) => x.logementId === id);
        if (l) deletedLinkIds.add(l.id);
      }
      await saveBuilding(addressId, {
        user,
        logements: logements.filter((l) => !deletedLogementIds.has(l.id)),
        deletedLogementIds: [...deletedLogementIds],
        links: keepLinks,
        deletedLinkIds: [...deletedLinkIds],
      });
      for (const l of keepLinks) savedLinkIds.add(l.id);
      deletedLinkIds.clear();
      toast('Immeuble enregistré');
      return true;
    },
  });

  const wrap = html(`<div class="bld">
    <div class="bld-top">
      <label class="field"><span>Accès (digicode, interphone, gardien)</span><input data-acces value="${esc(user.acces || '')}" placeholder="Ex. : code 4512B, interphone à gauche" /></label>
    </div>
    <div class="bld-add-floor"><button type="button" data-act="floor-up">${icon('plus', 20)} Ajouter un étage au-dessus</button></div>
    <div class="bld-grid"></div>
    <div class="bld-add-floor" style="margin-top:10px"><button type="button" data-act="floor-down" style="border-style:dotted;min-height:40px;font-size:14px">${icon('plus', 18)} Ajouter un niveau en dessous (sous-sol)</button></div>
    <div class="bld-legend muted">Touche un appartement pour le détail. ${icon('star', 13)} = intérêt. Rien n’est enregistré tant que tu n’as pas appuyé sur « Enregistrer ».</div>
  </div>`);
  page.body.appendChild(wrap);
  const grid = $('.bld-grid', wrap);

  function aptHTML(lg) {
    const c = contactOf(lg.id);
    const col = colorOf(lg);
    const last = lastPassage(addressId, lg.id);
    const meta = [c?.occupation ? OCCUPATIONS[c.occupation] : '', c?.tel ? formatPhone(c.tel) : ''].filter(Boolean).join(' · ');
    return `<div class="apt ${col}" data-lg="${lg.id}" role="button" tabindex="0">
      <button type="button" class="apt-del" data-del="${lg.id}" aria-label="Supprimer l'appartement">${icon('minus', 16)}</button>
      <span class="apt-loc">${esc(lg.loc || 'Sans localisation')}</span>
      <span class="apt-name">${c ? esc(contactDisplay(c)) : '<span class="muted">Pas de contact</span>'}</span>
      ${meta ? `<span class="apt-meta">${esc(meta)}</span>` : ''}
      <span class="apt-meta">${last ? `${RESULTS[last.result]} ${fmtDayShort(last.t)}` : 'Jamais visité'}</span>
      ${c?.interet ? `<span class="apt-star">${starIcon(c.interet === 2, 16)}</span>` : ''}
    </div>`;
  }

  function render() {
    const rows = [...user.etages].reverse();
    grid.innerHTML = rows
      .map((fl) => {
        const apts = logements.filter((l) => l.etageId === fl.id && !deletedLogementIds.has(l.id)).sort((x, y) => (x.order || 0) - (y.order || 0));
        return `<div class="bld-row" data-floor="${fl.id}">
          <div class="bld-floor">
            <button type="button" class="fl-label" data-rename="${fl.id}">${esc(fl.label)}</button>
            <button type="button" class="fl-del" data-delfloor="${fl.id}" aria-label="Supprimer l'étage">${icon('minus', 16)}</button>
          </div>
          <div class="bld-cells">${apts.map(aptHTML).join('')}<button type="button" class="apt-add" data-addapt="${fl.id}" aria-label="Ajouter un appartement">${icon('plus', 26)}</button></div>
        </div>`;
      })
      .join('');
  }
  render();
  const off = onChange(() => render());
  const origClose = page.close;
  page.close = () => {
    off();
    origClose();
  };

  async function editApartment(lg) {
    const isNewApt = !S.logements.has(lg.id) && !lg._seen;
    lg._seen = true;
    let finished = false;
    while (!finished) {
      const c = contactOf(lg.id);
      const b = blockedOf(lg);
      const last = lastPassage(addressId, lg.id);
      const res = await dialog({
        title: 'Appartement',
        cls: 'tall',
        body: `
          <label class="field"><span>Localisation à l’étage</span><input data-loc value="${esc(lg.loc || '')}" placeholder="Ex. : 1re porte à droite" /></label>
          <div class="field-label">Occupant</div>
          ${
            c
              ? `<div class="card" style="margin:0 0 10px;padding:10px 12px;background:#f7f9fc"><div style="display:flex;align-items:center;gap:10px"><span class="dot ${contactColor(c)}"></span><div class="li-main"><div class="li-title">${esc(
                  contactDisplay(c),
                )}</div><div class="li-sub">${esc([c.occupation ? OCCUPATIONS[c.occupation] : 'Statut inconnu', formatPhone(c.tel)].filter(Boolean).join(' · '))}</div></div></div>
                <div class="btn-row" style="margin-top:8px"><button type="button" class="btn btn-light btn-small" data-a="open">Ouvrir la fiche</button><button type="button" class="btn btn-light btn-small" data-a="unlink">Retirer</button></div></div>`
              : `<div class="btn-row" style="margin-bottom:10px"><button type="button" class="btn btn-light btn-small" data-a="new">${icon('userPlus', 18)} Nouveau</button><button type="button" class="btn btn-light btn-small" data-a="link">${icon('link', 18)} Contact existant</button></div>`
          }
          <div class="field-label">Passage</div>
          ${
            b
              ? blockedHTML(b.contact ? b : { by: 'logement' })
              : `<div class="quick"><button type="button" class="q-absent" data-p="absent">${icon('door', 20)}Absent</button><button type="button" class="q-contact" data-p="contact">${icon('user', 20)}Contact</button><button type="button" class="q-refus" data-p="refus">${icon('close', 20)}Refus</button></div>`
          }
          <p class="small muted" style="margin:6px 0 12px">${last ? `Dernier passage : ${RESULTS[last.result].toLowerCase()} le ${fmtDayShort(last.t)}` : 'Jamais visité'} · <button type="button" class="link-btn small" data-a="old" style="min-height:0;font-size:13px">Ancien passage</button></p>
          <label class="field" style="margin:0"><span>Couleur</span>${segHTML(
            'col',
            [
              ['', 'Auto'],
              ['vert', 'Vert'],
              ['orange', 'Orange'],
              ['rouge', 'Rouge'],
              ['gris', 'Gris'],
            ],
            lg.color || '',
          ).replace('class="seg"', 'class="seg colors"')}</label>`,
        buttons: [
          { label: 'Supprimer', value: { a: 'delete' }, kind: 'danger-light' },
          { label: 'OK', value: { a: 'ok' }, kind: 'primary' },
        ],
        onOpen(body, finish) {
          const locInput = $('[data-loc]', body);
          if (isNewApt && !lg.loc) setTimeout(() => locInput.focus(), 250);
          const syncLoc = () => {
            if ((lg.loc || '') !== locInput.value) {
              lg.loc = locInput.value;
              page.setDirty(true);
            }
          };
          locInput.addEventListener('input', syncLoc);
          bindSegs(body, (name, v) => {
            lg.color = v || null;
            page.setDirty(true);
          });
          body.addEventListener('click', (e) => {
            const x = e.target.closest('[data-a],[data-p]');
            if (!x) return;
            syncLoc();
            finish(x.dataset.a ? { a: x.dataset.a } : { p: x.dataset.p });
          });
        },
      });
      if (!res || res.a === 'ok') finished = true;
      else if (res.a === 'delete') {
        finished = await deleteApartment(lg);
      } else if (res.a === 'open') {
        nav.openContact(c.id);
        finished = true;
      } else if (res.a === 'unlink') setLink(lg.id, null);
      else if (res.a === 'link') {
        const r = await pickContact({ title: 'Occupant de l’appartement', allowNew: false });
        if (r?.contactId) setLink(lg.id, r.contactId);
      } else if (res.a === 'new') {
        nav.newContact({ link: null, onSaved: (nc) => setLink(lg.id, nc.id), title: 'Nouvel occupant' });
        finished = true;
      } else if (res.a === 'old') {
        await recordOldPassage({
          addressId,
          logementId: lg.id,
          candidates: c ? [c] : [],
          handlers: {
            link: async (link, contact) => setLink(lg.id, contact.id),
            setRouge: async () => {
              lg.color = 'rouge';
              page.setDirty(true);
            },
          },
        });
        finished = true;
      } else if (res.p) {
        await recordPassage({
          addressId,
          logementId: lg.id,
          result: res.p,
          candidates: c ? [c] : [],
          blocked: blockedOf(lg),
          handlers: {
            link: async (link, contact) => setLink(lg.id, contact.id),
            setRouge: async () => {
              lg.color = 'rouge';
              page.setDirty(true);
            },
          },
        });
        finished = true;
      }
      render();
    }
  }

  async function deleteApartment(lg) {
    const c = contactOf(lg.id);
    const ok = await confirmDialog(`Supprimer l’appartement « ${lg.loc || 'sans localisation'} »${c ? ` ? ${contactName(c)} restera dans tes contacts.` : ' ?'}`, { ok: 'Supprimer', danger: true });
    if (!ok) return false;
    deletedLogementIds.add(lg.id);
    const l = lgLinks.get(lg.id);
    if (l && savedLinkIds.has(l.id)) deletedLinkIds.add(l.id);
    lgLinks.delete(lg.id);
    page.setDirty(true);
    render();
    return true;
  }

  wrap.addEventListener('click', async (e) => {
    const t = e.target;
    const del = t.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      const lg = logements.find((l) => l.id === del.dataset.del);
      if (lg) await deleteApartment(lg);
      return;
    }
    const apt = t.closest('[data-lg]');
    if (apt) {
      const lg = logements.find((l) => l.id === apt.dataset.lg);
      if (lg) editApartment(lg);
      return;
    }
    const add = t.closest('[data-addapt]');
    if (add) {
      const etageId = add.dataset.addapt;
      const same = logements.filter((l) => l.etageId === etageId);
      const lg = { id: uid(), addressId, etageId, order: same.length ? Math.max(...same.map((l) => l.order || 0)) + 1 : 0, loc: '', createdAt: Date.now() };
      logements.push(lg);
      page.setDirty(true);
      render();
      const cells = grid.querySelector(`[data-floor="${etageId}"] .bld-cells`);
      if (cells) cells.scrollLeft = cells.scrollWidth;
      editApartment(lg);
      return;
    }
    const rn = t.closest('[data-rename]');
    if (rn) {
      const fl = user.etages.find((f) => f.id === rn.dataset.rename);
      const v = await dialog({
        title: 'Nom du niveau',
        body: `<label class="field"><span>Nom affiché</span><input data-v value="${esc(fl.label)}" /></label>`,
        buttons: [
          { label: 'Annuler', value: null, kind: 'light' },
          { label: 'OK', kind: 'primary', value: (b) => $('[data-v]', b).value.trim() },
        ],
      });
      if (v) {
        fl.label = v;
        page.setDirty(true);
        render();
      }
      return;
    }
    const df = t.closest('[data-delfloor]');
    if (df) {
      const fl = user.etages.find((f) => f.id === df.dataset.delfloor);
      const apts = logements.filter((l) => l.etageId === fl.id && !deletedLogementIds.has(l.id));
      if (user.etages.length === 1 && !apts.length) return toast('Il faut au moins un niveau');
      const ok = await confirmDialog(apts.length ? `Supprimer « ${fl.label} » et ses ${apts.length} appartement${apts.length > 1 ? 's' : ''} ? Les contacts restent dans tes contacts.` : `Supprimer « ${fl.label} » ?`, {
        ok: 'Supprimer',
        danger: true,
      });
      if (!ok) return;
      for (const lg of apts) {
        deletedLogementIds.add(lg.id);
        const l = lgLinks.get(lg.id);
        if (l && savedLinkIds.has(l.id)) deletedLinkIds.add(l.id);
        lgLinks.delete(lg.id);
      }
      user.etages = user.etages.filter((f) => f !== fl);
      if (!user.etages.length) user.etages = [{ id: uid(), label: 'RDC' }];
      page.setDirty(true);
      render();
      return;
    }
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'floor-up') {
      const below = user.etages.filter((f) => f.basement).length;
      user.etages.push({ id: uid(), label: autoLabel(user.etages.length - below) });
      page.setDirty(true);
      render();
    } else if (act === 'floor-down') {
      const below = user.etages.filter((f) => f.basement).length;
      user.etages.unshift({ id: uid(), label: below ? `Sous-sol ${below + 1}` : 'Sous-sol', basement: true });
      page.setDirty(true);
      render();
    }
  });
  return page;
}

register({ openBuilding });
