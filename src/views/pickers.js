// Sélecteurs réutilisables : choisir un contact, une adresse.
import { dialog, $ } from '../ui.js';
import { icon, starIcon } from '../icons.js';
import { esc, formatPhone } from '../util.js';
import { S, searchContacts, contactDisplay, contactColor, addrLabel, searchAddresses, ilotName, contactMainAddress } from '../state.js';

function contactRow(c, extra = '') {
  const a = contactMainAddress(c);
  return `<button type="button" class="li" data-id="${c.id}">
    <span class="dot ${contactColor(c)}"></span>
    <span class="li-main"><span class="li-title">${esc(contactDisplay(c))} ${c.interet ? starIcon(c.interet === 2, 14) : ''}</span>
    <span class="li-sub">${esc([a ? addrLabel(a) : '', formatPhone(c.tel)].filter(Boolean).join(' · ') || 'Aucune information')}</span></span>${extra}
  </button>`;
}

// Renvoie { contactId } ou { nouveau: true } ou null.
export function pickContact({ title = 'Choisir un contact', preferred = [], exclude = [], allowNew = true, newLabel = 'Nouveau contact' } = {}) {
  const ex = new Set(exclude);
  const pref = preferred.filter((c) => c && !ex.has(c.id));
  return dialog({
    title,
    cls: 'tall',
    body: `
      ${allowNew ? `<button type="button" class="btn btn-primary btn-block" data-new>${icon('userPlus', 20)} ${esc(newLabel)}</button>` : ''}
      ${pref.length ? `<div class="section-title" style="margin:14px 0 6px">À cette adresse</div><div class="pick-list" data-pref>${pref.map((c) => contactRow(c)).join('')}</div>` : ''}
      <div class="searchbar" style="margin:14px 0 0">${icon('search', 20)}<input type="search" placeholder="Nom, téléphone ou adresse" data-nodirty /></div>
      <div class="pick-list" data-list></div>`,
    buttons: [{ label: 'Annuler', value: null, kind: 'light' }],
    onOpen(body, finish) {
      const list = $('[data-list]', body);
      const input = $('input', body);
      const render = () => {
        const res = searchContacts(input.value)
          .filter((c) => !ex.has(c.id))
          .slice(0, 60);
        list.innerHTML = res.length ? res.map((c) => contactRow(c)).join('') : '<p class="muted" style="padding:14px">Aucun contact trouvé.</p>';
      };
      input.addEventListener('input', render);
      render();
      body.addEventListener('click', (e) => {
        if (e.target.closest('[data-new]')) return finish({ nouveau: true });
        const b = e.target.closest('.li[data-id]');
        if (b) finish({ contactId: b.dataset.id });
      });
    },
  });
}

export function pickAddress({ title = 'Choisir une adresse' } = {}) {
  return dialog({
    title,
    cls: 'tall',
    body: `<div class="searchbar" style="margin:0">${icon('search', 20)}<input type="search" placeholder="Ex. : 12 rue du Bel-Air" data-nodirty /></div>
      <div class="pick-list" data-list><p class="muted" style="padding:14px">Tape un numéro et un nom de rue.</p></div>`,
    buttons: [{ label: 'Annuler', value: null, kind: 'light' }],
    onOpen(body, finish) {
      const list = $('[data-list]', body);
      const input = $('input', body);
      input.addEventListener('input', () => {
        const res = searchAddresses(input.value, 40);
        list.innerHTML = res.length
          ? res.map((a) => `<button type="button" class="li" data-id="${esc(a.id)}"><span class="li-main"><span class="li-title">${esc(addrLabel(a))}</span><span class="li-sub">${esc(ilotName(a.ilot))}</span></span></button>`).join('')
          : '<p class="muted" style="padding:14px">Aucune adresse trouvée dans tes îlots.</p>';
      });
      list.addEventListener('click', (e) => {
        const b = e.target.closest('.li[data-id]');
        if (b) finish(b.dataset.id);
      });
      setTimeout(() => input.focus(), 250);
    },
  });
}

export function pickFromList({ title, items, empty = 'Rien à afficher.' }) {
  // items: [{ value, label, sub, dot }]
  return dialog({
    title,
    cls: 'tall',
    body: `<div class="pick-list" style="margin-top:0">${
      items.length
        ? items
            .map(
              (it, i) =>
                `<button type="button" class="li" data-i="${i}">${it.dot ? `<span class="dot ${it.dot}"></span>` : ''}<span class="li-main"><span class="li-title">${esc(it.label)}</span>${it.sub ? `<span class="li-sub">${esc(it.sub)}</span>` : ''}</span></button>`,
            )
            .join('')
        : `<p class="muted" style="padding:14px">${esc(empty)}</p>`
    }</div>`,
    buttons: [{ label: 'Annuler', value: null, kind: 'light' }],
    onOpen(body, finish) {
      body.addEventListener('click', (e) => {
        const b = e.target.closest('.li[data-i]');
        if (b) finish(items[+b.dataset.i].value);
      });
    },
  });
}

export { S };
