// Saisie rapide d'un passage : Absent, Contact ou Refus.
import { dialog, toast, $ } from '../ui.js';
import { icon, starIcon } from '../icons.js';
import { esc, fmtDate, fmtDateTime, todayStr, dayStr, parseLocalDateTime } from '../util.js';
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

// Valeur d'un champ date-heure (heure locale) : AAAA-MM-JJTHH:MM
const pad = (n) => String(n).padStart(2, '0');
export const toInputDateTime = (ms) => {
  const d = new Date(ms);
  return `${dayStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const isPast = (t) => t < Date.now() - 2 * 60000;

// Boîte de dialogue « Contact » ou « Refus ». Renvoie les choix, ou null si annulé.
async function askDetails({ addressId, logementId, result, candidates, allowNew, when = null }) {
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
    <label class="field"><span>Date du passage</span><input type="datetime-local" data-when value="${toInputDateTime(when || Date.now())}" max="${toInputDateTime(Date.now())}" /></label>
    <p class="small muted" style="margin:-8px 0 10px">À changer seulement pour une ancienne visite : elle ne comptera pas dans les portes de la semaine.</p>
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
          const t = parseLocalDateTime($('[data-when]', b).value);
          if (!Number.isFinite(t)) {
            toast('Date du passage invalide');
            return false;
          }
          if (t > Date.now() + 5 * 60000) {
            toast('La date du passage ne peut pas être dans le futur');
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
          t: Math.min(parseLocalDateTime($('[data-when]', b).value), Date.now()),
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
export async function recordPassage({ addressId, logementId = null, result, handlers = {}, candidates: cands = null, blocked: blk, when = null }) {
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
  const d = await askDetails({ addressId, logementId, result, candidates, allowNew: true, when });
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
      const stamp = `${fmtDate(d.t)} : refus${d.note ? ' (' + d.note + ')' : ''}`;
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
  const p = await addPassage({ addressId, logementId, contactId: contact?.id || null, result, scenarioId: d.scenarioId, note: d.note, t: d.t });
  nav.refreshCounter();
  const quand = isPast(p.t) ? ` (passage du ${fmtDateTime(p.t)})` : '';
  if (isNew) {
    toast(`Fiche créée${quand} : complète-la maintenant`);
    nav.openContact(contact.id, { isNew: true });
  } else toast(`${result === 'contact' ? 'Contact enregistré' : 'Refus enregistré'}${quand}`, { action: 'Annuler', onAction: () => deletePassage(p.id) });
  return p;
}

// Ancienne visite : choix du résultat et de la date, sans compter dans les portes de la semaine.
export async function recordOldPassage({ addressId, logementId = null, handlers = {}, candidates = null }) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(18, 0, 0, 0);
  const r = await dialog({
    title: 'Ancien passage',
    body: `<p class="muted small" style="margin-top:-4px">${esc(addrLabel(addressId))}</p>
      <label class="field"><span>Date et heure de la visite</span><input type="datetime-local" data-when value="${toInputDateTime(yesterday.getTime())}" max="${toInputDateTime(Date.now())}" /></label>
      <div class="field-label">Résultat</div>
      <div class="quick">
        <button type="button" class="q-absent" data-r="absent">${icon('door', 20)}Absent</button>
        <button type="button" class="q-contact" data-r="contact">${icon('user', 20)}Contact</button>
        <button type="button" class="q-refus" data-r="refus">${icon('close', 20)}Refus</button>
      </div>`,
    buttons: [{ label: 'Annuler', value: null, kind: 'light' }],
    onOpen(b, finish) {
      b.addEventListener('click', (e) => {
        const x = e.target.closest('[data-r]');
        if (!x) return;
        const t = parseLocalDateTime($('[data-when]', b).value);
        if (!Number.isFinite(t) || t > Date.now() + 5 * 60000) return toast('Choisis une date passée');
        finish({ result: x.dataset.r, t: Math.min(t, Date.now()) });
      });
    },
  });
  if (!r) return null;
  if (r.result === 'absent') {
    const p = await addPassage({ addressId, logementId, result: 'absent', t: r.t });
    toast(`Absent du ${fmtDateTime(r.t)} enregistré`, { action: 'Annuler', onAction: () => deletePassage(p.id) });
    return p;
  }
  return recordPassage({ addressId, logementId, result: r.result, handlers, candidates, blocked: null, when: r.t });
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
