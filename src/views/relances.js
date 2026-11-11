// Onglet Relances : relances datées, absents à repasser, ajout au calendrier de l'iPhone.
import { icon } from '../icons.js';
import { esc, fmtDate, fmtLong, fmtAgo, todayStr, addDays, dayStr, formatPhone, shareOrDownload } from '../util.js';
import { html, $, dialog, toast, emptyState } from '../ui.js';
import {
  S,
  onChange,
  relancesActives,
  relanceStatus,
  saveRelance,
  contactDisplay,
  contactColor,
  contactMainAddress,
  addrLabel,
  ilotName,
  absentsARepasser,
  isImmeuble,
} from '../state.js';
import { nav } from '../nav.js';
import { pickContact } from './pickers.js';
import { applyFilter } from './map.js';

// ---------- Calendrier (.ics) ----------
const icsEsc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const utc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function buildICS(r) {
  const c = r.contactId ? S.contacts.get(r.contactId) : null;
  const a = c ? contactMainAddress(c) : r.addressId ? S.addrs.get(r.addressId) : null;
  const title = `Relance : ${c ? contactDisplay(c) : 'prospection'}`;
  const desc = [r.objet, c?.tel ? `Tél : ${formatPhone(c.tel)}` : '', c?.projet ? `Projet : ${c.projet}` : ''].filter(Boolean).join('\n');
  const [y, m, d] = r.date.split('-').map(Number);
  let when;
  if (r.heure) {
    const [hh, mm] = r.heure.split(':').map(Number);
    const start = new Date(y, m - 1, d, hh, mm);
    const end = new Date(start.getTime() + 30 * 60000);
    when = [`DTSTART:${utc(start)}`, `DTEND:${utc(end)}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(title)}`, 'TRIGGER:-PT30M', 'END:VALARM'];
  } else {
    const next = new Date(y, m - 1, d + 1);
    when = [`DTSTART;VALUE=DATE:${r.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${dayStr(next).replace(/-/g, '')}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(title)}`, 'TRIGGER:PT9H', 'END:VALARM'];
  }
  // Le rappel doit être à l'intérieur de l'événement : on place VALARM juste avant END:VEVENT.
  const alarm = when.slice(when.indexOf('BEGIN:VALARM'));
  const times = when.slice(0, when.indexOf('BEGIN:VALARM'));
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Prospection//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${r.id}@prospection`,
    `DTSTAMP:${utc(new Date())}`,
    ...times,
    `SUMMARY:${icsEsc(title)}`,
    desc ? `DESCRIPTION:${icsEsc(desc)}` : '',
    a ? `LOCATION:${icsEsc(addrLabel(a) + ', 94500 Champigny-sur-Marne')}` : '',
    ...alarm,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

function b64url(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function addToCalendar(r) {
  if (!r) return;
  const ics = buildICS(r);
  const choice = await dialog({
    title: 'Ajouter au calendrier',
    body: `<p>${esc(fmtLong(r.date))}${r.heure ? ` à ${esc(r.heure)}` : ' (toute la journée, rappel à 9h)'}</p><p class="small muted">L’iPhone affiche l’événement : appuie ensuite sur « Ajouter ». Si rien ne s’ouvre, utilise « Partager le fichier » puis Calendrier.</p>`,
    buttons: [
      { label: 'Ouvrir dans Calendrier', value: 'open', kind: 'primary' },
      { label: 'Partager le fichier', value: 'share', kind: 'light' },
      { label: 'Annuler', value: null, kind: 'light' },
    ],
  });
  if (choice === 'open') {
    // Servi par le service worker de l'appli, avec le type « text/calendar ».
    location.href = `calendrier.ics?d=${b64url(ics)}`;
  } else if (choice === 'share') {
    await shareOrDownload(new Blob([ics], { type: 'text/calendar' }), 'relance.ics', 'Relance');
  }
}

export async function relanceDialog({ contactId = null, relance = null } = {}) {
  let cid = relance?.contactId || contactId;
  if (!cid) {
    const r = await pickContact({ title: 'Relance pour qui ?', allowNew: false });
    if (!r?.contactId) return null;
    cid = r.contactId;
  }
  const c = S.contacts.get(cid);
  const def = relance || { date: dayStr(addDays(Date.now(), 7)), heure: '', objet: '' };
  const quick = [
    ['Demain', 1],
    ['Dans 1 semaine', 7],
    ['Dans 1 mois', 30],
    ['Dans 3 mois', 91],
  ];
  return dialog({
    title: relance ? 'Modifier la relance' : 'Nouvelle relance',
    body: `<p class="muted" style="margin-top:-4px">${esc(contactDisplay(c))}</p>
      <div class="chips" style="padding:0 0 10px;flex-wrap:wrap" data-quick>${quick.map(([l, n]) => `<button type="button" class="chip" data-d="${n}">${l}</button>`).join('')}</div>
      <div class="grid2"><label class="field"><span>Date</span><input type="date" data-date value="${esc(def.date)}" /></label>
      <label class="field"><span>Heure (facultatif)</span><input type="time" data-heure value="${esc(def.heure || '')}" /></label></div>
      <label class="field" style="margin:0"><span>Objet</span><input data-objet value="${esc(def.objet || '')}" placeholder="Ex. : rappeler pour l’estimation" /></label>`,
    buttons: [
      { label: 'Annuler', value: null, kind: 'light' },
      {
        label: 'Enregistrer',
        kind: 'primary',
        validate: (b) => {
          if (!$('[data-date]', b).value) {
            toast('Choisis une date');
            return false;
          }
          return true;
        },
        value: (b) => ({ ...(relance || {}), contactId: cid, date: $('[data-date]', b).value, heure: $('[data-heure]', b).value, objet: $('[data-objet]', b).value.trim(), done: relance?.done || false }),
      },
    ],
    onOpen(b) {
      $('[data-quick]', b).addEventListener('click', (e) => {
        const x = e.target.closest('[data-d]');
        if (x) $('[data-date]', b).value = dayStr(addDays(Date.now(), +x.dataset.d));
      });
    },
  });
}

// ---------- Onglet ----------
export function relancesBadge() {
  const t = todayStr();
  return relancesActives().filter((r) => r.date <= t).length;
}

function relanceRow(r) {
  const c = S.contacts.get(r.contactId);
  const st = relanceStatus(r);
  return `<div class="li" data-rel="${r.id}">
    <span class="dot ${contactColor(c)}"></span>
    <button type="button" class="li-main" data-open="${r.contactId}" style="text-align:left">
      <span class="li-title">${esc(contactDisplay(c))}</span>
      <span class="li-sub" style="white-space:normal">${st === 'retard' ? `<b style="color:var(--rouge)">${esc(fmtDate(r.date))}</b>` : esc(fmtLong(r.date))}${r.heure ? ` à ${esc(r.heure)}` : ''}${r.objet ? ` · ${esc(r.objet)}` : ''}</span>
    </button>
    ${r.done ? '' : `<button type="button" class="icon-btn plain" data-cal="${r.id}" aria-label="Calendrier">${icon('calendar', 21)}</button><button type="button" class="icon-btn" data-done="${r.id}" aria-label="Marquer comme faite">${icon('check', 20)}</button>`}
  </div>`;
}

function absentRow(x) {
  const lg = x.logementId ? S.logements.get(x.logementId) : null;
  const a = S.addrs.get(x.addressId);
  return `<button type="button" class="li" data-abs="${esc(x.addressId)}" data-lg="${x.logementId || ''}">
    <span class="dot hollow"></span>
    <span class="li-main"><span class="li-title">${esc(addrLabel(a))}${lg ? ` · ${esc(lg.loc || 'appartement')}` : x.logementId ? '' : isImmeuble(x.addressId) ? ' · entrée' : ''}</span>
    <span class="li-sub">${esc(ilotName(a?.ilot))} · absent ${x.count > 1 ? `${x.count} fois de suite, ` : ''}${fmtAgo(x.last)}</span></span>
    ${icon('chevron', 18, 'chev')}
  </button>`;
}

let showDone = false;
let absLimit = 30;
export function initRelances(root) {
  const render = () => {
    const t = todayStr();
    const all = relancesActives();
    const retard = all.filter((r) => r.date < t).sort((a, b) => (a.date < b.date ? -1 : 1));
    const jour = all.filter((r) => r.date === t).sort((a, b) => (a.heure || '99') < (b.heure || '99') ? -1 : 1);
    const avenir = all.filter((r) => r.date > t).sort((a, b) => (a.date < b.date ? -1 : 1));
    const faites = [...S.relances.values()].filter((r) => r.done && r.doneAt > Date.now() - 30 * 86400000).sort((a, b) => b.doneAt - a.doneAt);
    const abs = absentsARepasser();
    root.innerHTML = `
      <div class="tab-head"><h1>Relances</h1><button type="button" class="head-btn" data-new>${icon('plus', 18)} Relance</button></div>
      ${
        !all.length && !abs.length
          ? emptyState('Rien à relancer pour le moment.', 'Les absents et les relances datées apparaîtront ici.')
          : ''
      }
      ${retard.length ? `<div class="section-title" style="color:var(--rouge)">En retard <span class="count">${retard.length}</span></div><div class="list">${retard.map(relanceRow).join('')}</div>` : ''}
      ${jour.length ? `<div class="section-title">Aujourd’hui <span class="count">${jour.length}</span></div><div class="list">${jour.map(relanceRow).join('')}</div>` : ''}
      ${avenir.length ? `<div class="section-title">À venir <span class="count">${avenir.length}</span></div><div class="list">${avenir.slice(0, 50).map(relanceRow).join('')}</div>` : ''}
      ${
        abs.length
          ? `<div class="section-title">Absents à repasser <span class="count">${abs.length}</span></div>
             <div class="list">${abs.slice(0, absLimit).map(absentRow).join('')}</div>
             ${abs.length > absLimit ? `<div class="pad"><button type="button" class="link-btn" data-more>Voir plus</button></div>` : ''}
             <div class="pad"><button type="button" class="btn btn-light btn-block" data-absmap>${icon('map', 18)} Voir les absents sur la carte</button></div>`
          : ''
      }
      ${faites.length ? `<div class="pad" style="margin-top:14px"><button type="button" class="link-btn" data-toggledone>${showDone ? 'Masquer' : 'Afficher'} les relances faites (${faites.length})</button></div>${showDone ? `<div class="list">${faites.map(relanceRow).join('')}</div>` : ''}` : ''}
    `;
  };
  render();
  onChange(render);
  root.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-new]')) {
      const r = await relanceDialog();
      if (r) {
        await saveRelance(r);
        toast('Relance ajoutée');
      }
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
    const open = t.closest('[data-open]');
    if (open) return nav.openContact(open.dataset.open);
    const ab = t.closest('[data-abs]');
    if (ab) {
      if (ab.dataset.lg) {
        nav.showOnMap(ab.dataset.abs, { open: false });
        return setTimeout(() => nav.openBuilding(ab.dataset.abs), 120);
      }
      return nav.showOnMap(ab.dataset.abs);
    }
    if (t.closest('[data-absmap]')) {
      nav.goTab('carte');
      return setTimeout(() => applyFilter({ absents: true }), 80);
    }
    if (t.closest('[data-more]')) {
      absLimit += 50;
      return render();
    }
    if (t.closest('[data-toggledone]')) {
      showDone = !showDone;
      render();
    }
  });
}
