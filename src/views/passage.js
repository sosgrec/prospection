// Saisie rapide d'un passage : Absent, Contact ou Refus.
import { dialog, toast, $ } from '../ui.js';
import { icon, starIcon } from '../icons.js';
import { esc, fmtDate, todayStr } from '../util.js';
import {
  S,
  addPassage,
  deletePassage,
  saveContact,
  saveLink,
  newContact,
  contactDisplay,
  contactColor,
  activeScenarios,
  scenariosPresentes,
  scenariosPresentesAdresse,
  habitantsOf,
  proprietairesOf,
  contactOfLogement,
  blockedAddress,
  blockedLogement,
  addrUser,
  saveAddrUser,
  addrLabel,
} from '../state.js';
import { nav } from '../nav.js';
import { pickContact } from './pickers.js';

export function candidatesFor(addressId, logementId) {
  if (logementId) {
    const c = contactOfLogement(logementId);
    return c ? [c] : [];
  }
  const seen = new Set();
  return [...habitantsOf(addressId), ...proprietairesOf(addressId)].filter((c) => c && !seen.has(c.id) && seen.add(c.id));
}

export function blockedInfo(addressId, logementId) {
  if (logementId) {
    const lg = S.logements.get(logementId);
    return lg ? blockedLogement(lg) : null;
  }
  return blockedAddress(addressId);
}

export function blockedHTML(b) {
  if (!b) return '';
  const who = b.contact ? `${esc(contactDisplay(b.contact))} a demandé à ne plus être sollicité` : 'Adresse marquée « pas de démarchage »';
  return `<div class="blocked">${icon('alert', 18)} Ne plus solliciter<div class="muted small">${who}${b.date ? ` (le ${fmtDate(b.date)})` : ''}.</div></div>`;
}

// Boîte de dialogue « Contact » ou « Refus ». Renvoie les choix, ou null si annulé.
async function askDetails({ addressId, logementId, result, candidates, allowNew }) {
  const isContact = result === 'contact';
  const scen = activeScenarios();
  let choice = candidates.length === 1 ? { contactId: candidates[0].id } : candidates.length ? null : allowNew && isContact ? { nouveau: true } : { none: true };
  const extraContacts = [];
  const choiceHTML = () => {
    const opts = [...candidates, ...extraContacts];
    const isOn = (c) => choice?.contactId === c.id;
    return `${opts
      .map(
        (c) => `<button type="button" class="li ${isOn(c) ? 'on' : ''}" data-c="${c.id}"><span class="dot ${contactColor(c)}"></span><span class="li-main"><span class="li-title">${esc(contactDisplay(c))} ${
          c.interet ? starIcon(c.interet === 2, 14) : ''
        }</span></span>${isOn(c) ? icon('check', 20) : ''}</button>`,
      )
      .join('')}
      ${allowNew ? `<button type="button" class="li ${choice?.nouveau ? 'on' : ''}" data-new>${icon('userPlus', 20)}<span class="li-main"><span class="li-title">Nouvelle personne</span><span class="li-sub">Crée la fiche, à compléter ensuite</span></span>${choice?.nouveau ? icon('check', 20) : ''}</button>` : ''}
      <button type="button" class="li" data-other>${icon('search', 20)}<span class="li-main"><span class="li-title">Contact déjà enregistré…</span></span></button>
      <button type="button" class="li ${choice?.none ? 'on' : ''}" data-none><span class="li-main"><span class="li-title">Sans fiche</span><span class="li-sub">${isContact ? 'Personne non identifiée' : 'Refus sans nom'}</span></span>${choice?.none ? icon('check', 20) : ''}</button>`;
  };
  const scenHTML = () => {
    const pres = choice?.contactId ? scenariosPresentes(choice.contactId) : new Map();
    return `<option value="">Aucun scénario</option>${scen
      .map((s) => `<option value="${s.id}">${esc(s.titre || 'Sans titre')}${pres.has(s.id) ? ` (déjà présenté le ${fmtDate(pres.get(s.id))})` : ''}</option>`)
      .join('')}`;
  };
  const body = `
    <p class="muted small" style="margin-top:-4px">${esc(addrLabel(addressId))}</p>
    <div class="field-label">${isContact ? 'Qui as-tu rencontré ?' : 'Qui a refusé ?'}</div>
    <div class="pick-list" data-who style="margin-top:0">${choiceHTML()}</div>
    ${
      isContact
        ? `<label class="field" style="margin-top:14px"><span>Scénario présenté</span><select data-scen>${scenHTML()}</select></label>
           <div data-warn></div>`
        : ''
    }
    <label class="field" style="margin-top:${isContact ? 0 : 14}px"><span>Note (facultatif)</span><textarea data-note rows="2" placeholder="${isContact ? 'Ce que tu as appris' : 'Raison du refus'}"></textarea></label>
    ${
      !isContact
        ? `<label class="check"><input type="checkbox" data-neplus /> <span>La personne demande à ne plus être sollicitée</span></label>`
        : ''
    }`;
  return dialog({
    title: isContact ? 'Contact' : 'Refus',
    cls: 'tall',
    body,
    buttons: [
      { label: 'Annuler', value: null, kind: 'light' },
      {
        label: 'Enregistrer',
        kind: isContact ? 'primary' : 'danger',
        validate: async (b) => {
          if (!choice) {
            toast('Choisis la personne, ou « Sans fiche »');
            return false;
          }
          if (isContact && choice.contactId) {
            const sid = $('[data-scen]', b).value;
            const pres = scenariosPresentes(choice.contactId);
            if (sid && pres.has(sid)) {
              const go = await dialog({
                title: 'Scénario déjà présenté',
                body: `<p>Tu as déjà présenté ce scénario à cette personne le ${fmtDate(pres.get(sid))}.</p>`,
                buttons: [
                  { label: 'Changer', value: false, kind: 'light' },
                  { label: 'Continuer', value: true, kind: 'primary' },
                ],
              });
              return !!go;
            }
          }
          return true;
        },
        value: (b) => ({
          result,
          choice,
          scenarioId: isContact ? $('[data-scen]', b).value || null : null,
          note: $('[data-note]', b).value.trim(),
          nePlus: !isContact && $('[data-neplus]', b).checked,
        }),
      },
    ],
    onOpen(b) {
      const who = $('[data-who]', b);
      const refreshWarn = () => {
        if (!isContact) return;
        const sel = $('[data-scen]', b);
        const warn = $('[data-warn]', b);
        const sid = sel.value;
        if (!sid) return (warn.innerHTML = '');
        const pres = choice?.contactId ? scenariosPresentes(choice.contactId) : new Map();
        const presA = scenariosPresentesAdresse(addressId);
        if (pres.has(sid)) warn.innerHTML = `<div class="warn-box">Déjà présenté à cette personne le ${fmtDate(pres.get(sid))}.</div>`;
        else if (presA.has(sid)) warn.innerHTML = `<div class="info-box">Déjà utilisé à cette adresse le ${fmtDate(presA.get(sid))}, avec quelqu'un d'autre.</div>`;
        else warn.innerHTML = '';
      };
      const rerender = () => {
        who.innerHTML = choiceHTML();
        if (isContact) {
          const sel = $('[data-scen]', b);
          const v = sel.value;
          sel.innerHTML = scenHTML();
          sel.value = v;
          refreshWarn();
        }
      };
      who.addEventListener('click', async (e) => {
        const li = e.target.closest('.li');
        if (!li) return;
        if (li.dataset.c) choice = { contactId: li.dataset.c };
        else if (li.hasAttribute('data-new')) choice = { nouveau: true };
        else if (li.hasAttribute('data-none')) choice = { none: true };
        else if (li.hasAttribute('data-other')) {
          const r = await pickContact({ title: 'Contact enregistré', allowNew: false, exclude: [...candidates, ...extraContacts].map((c) => c.id) });
          if (r?.contactId) {
            const c = S.contacts.get(r.contactId);
            extraContacts.push(c);
            choice = { contactId: c.id, existing: true };
          }
        }
        rerender();
      });
      if (isContact) $('[data-scen]', b).addEventListener('change', refreshWarn);
    },
  });
}

// Enregistre un passage. `handlers` permet à la vue immeuble de garder liens et couleurs dans son brouillon.
export async function recordPassage({ addressId, logementId = null, result, handlers = {}, candidates: cands = null, blocked: blk }) {
  const blocked = blk !== undefined ? blk : blockedInfo(addressId, logementId);
  if (blocked) {
    await dialog({ title: 'Ne plus solliciter', body: blockedHTML(blocked), buttons: [{ label: 'Compris', value: true, kind: 'primary' }] });
    return null;
  }
  if (result === 'absent') {
    const p = await addPassage({ addressId, logementId, result: 'absent' });
    toast('Absent noté : à repasser', { action: 'Annuler', onAction: () => deletePassage(p.id) });
    nav.refreshCounter();
    return p;
  }
  const candidates = cands || candidatesFor(addressId, logementId);
  const d = await askDetails({ addressId, logementId, result, candidates, allowNew: true });
  if (!d) return null;
  let contact = null;
  let isNew = false;
  if (d.choice.nouveau) {
    contact = await saveContact(newContact());
    isNew = true;
  } else if (d.choice.contactId) contact = S.contacts.get(d.choice.contactId);
  if (contact && (isNew || d.choice.existing)) {
    const link = { contactId: contact.id, addressId, logementId, role: 'habitant' };
    if (handlers.link) await handlers.link(link, contact);
    else await saveLink(link);
  }
  if (result === 'refus') {
    if (contact) {
      const stamp = `${fmtDate(todayStr())} : refus${d.note ? ' (' + d.note + ')' : ''}`;
      contact.refusNote = [contact.refusNote, stamp].filter(Boolean).join('\n');
      if (d.nePlus) {
        contact.nePlusSolliciter = true;
        contact.nePlusDate = todayStr();
      }
      await saveContact(contact);
    } else if (d.nePlus) {
      if (handlers.setRouge) await handlers.setRouge();
      else if (!logementId) {
        const u = { ...addrUser(addressId) };
        u.color = 'rouge';
        u.colorAt = todayStr();
        u.note = [u.note, `${fmtDate(todayStr())} : ne plus solliciter${d.note ? ' (' + d.note + ')' : ''}`].filter(Boolean).join('\n');
        await saveAddrUser(u);
      }
    }
  }
  const p = await addPassage({ addressId, logementId, contactId: contact?.id || null, result, scenarioId: d.scenarioId, note: d.note });
  nav.refreshCounter();
  if (isNew) {
    toast('Fiche créée : complète-la maintenant');
    nav.openContact(contact.id, { isNew: true });
  } else toast(result === 'contact' ? 'Contact enregistré' : 'Refus enregistré', { action: 'Annuler', onAction: () => deletePassage(p.id) });
  return p;
}

export function quickButtonsHTML(addressId, logementId = null) {
  const b = blockedInfo(addressId, logementId);
  if (b) return blockedHTML(b);
  const lg = logementId ? ` data-lg="${logementId}"` : '';
  return `<div class="quick">
    <button type="button" class="q-absent" data-pass="absent"${lg}>${icon('door', 20)}Absent</button>
    <button type="button" class="q-contact" data-pass="contact"${lg}>${icon('user', 20)}Contact</button>
    <button type="button" class="q-refus" data-pass="refus"${lg}>${icon('close', 20)}Refus</button>
  </div>`;
}
