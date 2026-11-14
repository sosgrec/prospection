// Onglet Contacts : carnet d'adresses avec recherche et filtres.
import { icon, starIcon } from '../icons.js';
import { esc, formatPhone, fmtAgo } from '../util.js';
import { $, emptyState } from '../ui.js';
import { S, onChange, searchContacts, contactDisplay, contactColor, contactMainAddress, addrLabel, vendeurPotentiel, passagesOfContact, OCCUPATIONS, accordManquant, contactsSansAccord } from '../state.js';
import { nav } from '../nav.js';

const FILTERS = [
  ['tous', 'Tous'],
  ['chauds', 'Chauds'],
  ['tiedes', 'Tièdes'],
  ['mandats', 'Mandats'],
  ['proprietaires', 'Propriétaires'],
  ['locataires', 'Locataires'],
  ['vendeurs', 'Installés 7 à 10 ans'],
  ['accord', 'Accord manquant'],
  ['neplus', 'Ne plus solliciter'],
];
let q = '';
let filter = 'tous';
let sort = 'recent';

function pass(c) {
  switch (filter) {
    case 'chauds':
      return c.interet === 2;
    case 'tiedes':
      return c.interet === 1;
    case 'mandats':
      return c.mandatSigne;
    case 'proprietaires':
      return c.occupation === 'proprietaire';
    case 'locataires':
      return c.occupation === 'locataire';
    case 'vendeurs':
      return vendeurPotentiel(c);
    case 'neplus':
      return c.nePlusSolliciter;
    case 'accord':
      return accordManquant(c);
    default:
      return true;
  }
}

function lastActivity(c) {
  const p = passagesOfContact(c.id)[0];
  return Math.max(p?.t || 0, c.updatedAt || 0, c.createdAt || 0);
}

export function initContacts(root) {
  root.innerHTML = `
    <div class="tab-head"><h1>Contacts</h1><button type="button" class="head-btn" data-new>${icon('plus', 18)} Nouveau</button></div>
    <div class="searchbar">${icon('search', 20)}<input type="search" placeholder="Nom, téléphone ou adresse" data-q /></div>
    <div data-rgpd></div>
    <div class="chips" data-filters>${FILTERS.map(([k, l]) => `<button type="button" class="chip ${k === filter ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
    <div class="pad" style="display:flex;justify-content:space-between;align-items:center;margin:-2px 0 6px"><span class="small muted" data-count></span>
      <button type="button" class="link-btn small" data-sort style="min-height:32px;font-size:14px"></button></div>
    <div data-list></div>`;
  const list = $('[data-list]', root);
  const setFilter = (k) => {
    filter = k;
    for (const x of root.querySelectorAll('[data-filters] [data-f]')) x.classList.toggle('on', x.dataset.f === k);
    root.querySelector(`[data-filters] [data-f="${k}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
  };
  root.addEventListener('contacts:filtre', (e) => {
    setFilter(e.detail);
    render();
  });
  const render = () => {
    const sans = contactsSansAccord().length;
    $('[data-rgpd]', root).innerHTML =
      sans && filter !== 'accord'
        ? `<button type="button" class="rgpd-notice" data-f="accord">${icon('alert', 18)}<span>${sans === 1 ? '1 contact a' : `${sans} contacts ont`} des coordonnées sans accord noté</span><span class="link">Voir</span></button>`
        : '';
    let res = searchContacts(q).filter(pass);
    if (sort === 'az') res.sort((a, b) => contactDisplay(a).localeCompare(contactDisplay(b), 'fr'));
    else res.sort((a, b) => lastActivity(b) - lastActivity(a));
    $('[data-count]', root).textContent = `${res.length} contact${res.length > 1 ? 's' : ''}`;
    $('[data-sort]', root).textContent = sort === 'az' ? 'Tri : A → Z' : 'Tri : activité récente';
    if (!res.length) {
      list.innerHTML = S.contacts.size ? emptyState('Aucun contact ne correspond.') : emptyState('Aucun contact pour le moment.', 'Crée une fiche ici, ou depuis une adresse sur la carte avec « Nouveau contact ».');
      return;
    }
    list.innerHTML = `<div class="list">${res
      .slice(0, 300)
      .map((c) => {
        const a = contactMainAddress(c);
        const sub = [a ? addrLabel(a) : '', formatPhone(c.tel)].filter(Boolean).join(' · ') || (c.occupation ? OCCUPATIONS[c.occupation] : 'Fiche à compléter');
        const badges = [
          c.mandatSigne ? '<span class="pill vert" style="font-size:11px;padding:1px 7px">Mandat</span>' : '',
          vendeurPotentiel(c) ? '<span class="pill" style="font-size:11px;padding:1px 7px;background:#efe7fd;color:#5b21b6">7-10 ans</span>' : '',
          accordManquant(c) ? '<span class="pill warn" style="font-size:11px;padding:1px 7px">Sans accord</span>' : '',
        ].join('');
        return `<button type="button" class="li" data-id="${c.id}">
          <span class="dot ${contactColor(c)}"></span>
          <span class="li-main"><span class="li-title">${esc(contactDisplay(c))} ${c.interet ? starIcon(c.interet === 2, 15) : ''} ${badges}</span><span class="li-sub">${esc(sub)}</span></span>
          <span class="li-side">${fmtAgo(lastActivity(c))}</span>
        </button>`;
      })
      .join('')}</div>`;
  };
  render();
  onChange(render);
  $('[data-q]', root).addEventListener('input', (e) => {
    q = e.target.value;
    render();
  });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-new]')) return nav.newContact({});
    const f = e.target.closest('[data-f]');
    if (f) {
      setFilter(f.dataset.f);
      return render();
    }
    if (e.target.closest('[data-sort]')) {
      sort = sort === 'az' ? 'recent' : 'az';
      return render();
    }
    const b = e.target.closest('.li[data-id]');
    if (b) nav.openContact(b.dataset.id);
  });
}
