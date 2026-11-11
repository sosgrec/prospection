// Composants d'interface : pages plein écran, feuilles, boîtes de dialogue, messages.
import { icon } from './icons.js';
import { esc } from './util.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function html(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}

// ---------- Messages courts ----------
export function toast(msg, { action, onAction, ms = 3500 } = {}) {
  const root = $('#toast-root');
  const el = html(`<div class="toast"><span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}</div>`);
  root.innerHTML = '';
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  let timer = setTimeout(close, ms);
  function close() {
    clearTimeout(timer);
    el.classList.remove('in');
    setTimeout(() => el.remove(), 250);
  }
  if (action)
    el.querySelector('button').addEventListener('click', () => {
      close();
      onAction?.();
    });
  return close;
}

// ---------- Boîtes de dialogue ----------
let dialogDepth = 0;
export function dialog({ title, body = '', buttons = [{ label: 'OK', value: true, kind: 'primary' }], dismissible = true, cls = '', onOpen } = {}) {
  return new Promise((resolve) => {
    const root = $('#dialog-root');
    const el = html(`
      <div class="dlg-backdrop">
        <div class="dlg ${cls}" role="dialog" aria-modal="true">
          ${title ? `<h3 class="dlg-title">${esc(title)}</h3>` : ''}
          <div class="dlg-body"></div>
          <div class="dlg-buttons ${buttons.length > 2 ? 'stack' : ''}"></div>
        </div>
      </div>`);
    const bodyEl = el.querySelector('.dlg-body');
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body) bodyEl.appendChild(body);
    const btns = el.querySelector('.dlg-buttons');
    let closed = false;
    const finish = (v) => {
      if (closed) return;
      closed = true;
      el.classList.remove('in');
      dialogDepth--;
      setTimeout(() => el.remove(), 200);
      resolve(v);
    };
    for (const b of buttons) {
      const be = html(`<button type="button" class="btn ${b.kind ? 'btn-' + b.kind : 'btn-light'}">${esc(b.label)}</button>`);
      be.addEventListener('click', async () => {
        if (b.validate) {
          const ok = await b.validate(bodyEl);
          if (!ok) return;
        }
        finish(typeof b.value === 'function' ? b.value(bodyEl) : b.value);
      });
      btns.appendChild(be);
    }
    if (dismissible)
      el.addEventListener('click', (e) => {
        if (e.target === el) finish(null);
      });
    root.appendChild(el);
    dialogDepth++;
    requestAnimationFrame(() => el.classList.add('in'));
    onOpen?.(bodyEl, finish);
  });
}
export const isDialogOpen = () => dialogDepth > 0;

export function confirmDialog(text, { title = '', ok = 'Confirmer', cancel = 'Annuler', danger = false } = {}) {
  return dialog({
    title,
    body: `<p>${esc(text)}</p>`,
    buttons: [
      { label: cancel, value: false, kind: 'light' },
      { label: ok, value: true, kind: danger ? 'danger' : 'primary' },
    ],
  }).then((v) => v === true);
}

export function saveChangesDialog() {
  return dialog({
    title: 'Enregistrer les modifications ?',
    body: '<p>Des changements n’ont pas été enregistrés.</p>',
    buttons: [
      { label: 'Enregistrer', value: 'save', kind: 'primary' },
      { label: 'Ne pas enregistrer', value: 'discard', kind: 'danger-light' },
      { label: 'Annuler', value: 'cancel', kind: 'light' },
    ],
  }).then((v) => v || 'cancel');
}

// ---------- Feuille du bas (au-dessus de la carte, non bloquante) ----------
let currentSheet = null;
export function openSheet({ content, onClose, cls = '' }) {
  closeSheet(true);
  const root = $('#sheet-root');
  const el = html(`<div class="sheet ${cls}"><div class="sheet-grip" aria-hidden="true"></div><button type="button" class="sheet-close" aria-label="Fermer">${icon('close', 20)}</button><div class="sheet-body"></div></div>`);
  const bodyEl = el.querySelector('.sheet-body');
  if (typeof content === 'string') bodyEl.innerHTML = content;
  else bodyEl.appendChild(content);
  root.appendChild(el);
  const sheet = {
    el,
    body: bodyEl,
    onClose,
    close: () => {
      if (currentSheet === sheet) closeSheet();
    },
    set(contentNew) {
      bodyEl.innerHTML = '';
      if (typeof contentNew === 'string') bodyEl.innerHTML = contentNew;
      else bodyEl.appendChild(contentNew);
    },
  };
  el.querySelector('.sheet-close').addEventListener('click', () => sheet.close());
  // Glisser vers le bas pour fermer
  let y0 = null;
  let dy = 0;
  const grip = el.querySelector('.sheet-grip');
  const start = (e) => {
    if (bodyEl.scrollTop > 0 && e.target !== grip) return;
    y0 = e.touches[0].clientY;
    dy = 0;
  };
  const move = (e) => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy > 0) {
      el.style.transform = `translateY(${dy}px)`;
      el.style.transition = 'none';
    }
  };
  const end = () => {
    if (y0 == null) return;
    el.style.transition = '';
    el.style.transform = '';
    if (dy > 90) sheet.close();
    y0 = null;
  };
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchmove', move, { passive: true });
  el.addEventListener('touchend', end);
  currentSheet = sheet;
  requestAnimationFrame(() => el.classList.add('in'));
  document.body.classList.add('has-sheet');
  return sheet;
}
export function closeSheet(silent = false) {
  const s = currentSheet;
  if (!s) return;
  currentSheet = null;
  s.el.classList.remove('in');
  setTimeout(() => s.el.remove(), 250);
  document.body.classList.remove('has-sheet');
  if (!silent) s.onClose?.();
  else s.onClose?.('replaced');
}
export const getSheet = () => currentSheet;

// ---------- Pages plein écran (empilées) ----------
const stack = [];
export function pushPage({ title, save, saveLabel = 'Enregistrer', onClose, cls = '', headerExtra = '' }) {
  const root = $('#pages');
  const el = html(`
    <div class="page ${cls}">
      <header class="page-head">
        <button type="button" class="ph-btn ph-close" aria-label="Fermer">${icon('close', 22)}</button>
        <h2 class="ph-title"></h2>
        <div class="ph-actions">${headerExtra}${save ? `<button type="button" class="ph-save">${esc(saveLabel)}</button>` : ''}</div>
      </header>
      <div class="page-body"></div>
    </div>`);
  const page = {
    el,
    body: el.querySelector('.page-body'),
    dirty: false,
    closed: false,
    setTitle(t) {
      el.querySelector('.ph-title').textContent = t;
    },
    setDirty(v = true) {
      page.dirty = v;
      el.classList.toggle('dirty', v);
    },
    async save() {
      if (!save) return true;
      const btn = el.querySelector('.ph-save');
      btn.disabled = true;
      try {
        const ok = await save(page);
        if (ok !== false) page.setDirty(false);
        return ok !== false;
      } finally {
        btn.disabled = false;
      }
    },
    async requestClose() {
      if (page.dirty) {
        const choice = await saveChangesDialog();
        if (choice === 'cancel') return false;
        if (choice === 'save') {
          const ok = await page.save();
          if (!ok) return false;
        }
      }
      page.close();
      return true;
    },
    close() {
      if (page.closed) return;
      page.closed = true;
      el.classList.remove('in');
      const i = stack.indexOf(page);
      if (i >= 0) stack.splice(i, 1);
      setTimeout(() => el.remove(), 260);
      onClose?.();
    },
  };
  page.setTitle(title || '');
  el.querySelector('.ph-close').addEventListener('click', () => page.requestClose());
  if (save) el.querySelector('.ph-save').addEventListener('click', () => page.save());
  // Toute saisie marque la page comme modifiée
  page.body.addEventListener('input', (e) => {
    if (e.target.closest('[data-nodirty]')) return;
    page.setDirty(true);
  });
  page.body.addEventListener('change', (e) => {
    if (e.target.closest('[data-nodirty]')) return;
    page.setDirty(true);
  });
  root.appendChild(el);
  stack.push(page);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  return page;
}
export const topPage = () => stack[stack.length - 1] || null;
export const pageCount = () => stack.length;

// ---------- Divers ----------
export async function copyText(text, label = 'Copié') {
  const s = String(text ?? '');
  if (!s) return;
  try {
    await navigator.clipboard.writeText(s);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = s;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch {
      /* rien */
    }
    ta.remove();
  }
  toast(label);
}

// Contrôle segmenté : <div class="seg" data-name="x"> avec boutons data-v.
export function segHTML(name, options, value) {
  return `<div class="seg" data-seg="${esc(name)}">${options
    .map(([v, l]) => `<button type="button" data-v="${esc(v)}" class="${String(v) === String(value ?? '') ? 'on' : ''}">${esc(l)}</button>`)
    .join('')}</div>`;
}
export function bindSegs(root, onChange) {
  for (const seg of $$('.seg[data-seg]', root)) {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      for (const x of seg.querySelectorAll('button')) x.classList.toggle('on', x === b);
      onChange?.(seg.dataset.seg, b.dataset.v);
      seg.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
}
export const segValue = (root, name) => $(`.seg[data-seg="${name}"] button.on`, root)?.dataset.v ?? '';

// Saisie d'étiquettes (chips).
export function tagsInput(tags = [], suggestions = []) {
  const el = html(`<div class="tags-input"><div class="tags-list"></div><input type="text" placeholder="Ajouter une étiquette" enterkeyhint="done" autocapitalize="none" list="" /></div>`);
  const list = el.querySelector('.tags-list');
  const input = el.querySelector('input');
  let values = [...tags];
  const render = () => {
    list.innerHTML = values.map((t, i) => `<span class="chip">${esc(t)}<button type="button" data-i="${i}" aria-label="Retirer">×</button></span>`).join('');
    sugg.innerHTML = suggestions
      .filter((s) => !values.includes(s))
      .slice(0, 8)
      .map((s) => `<button type="button" class="chip chip-sugg">${esc(s)}</button>`)
      .join('');
  };
  const sugg = html('<div class="tags-sugg"></div>');
  el.appendChild(sugg);
  const add = (t) => {
    t = t.trim();
    if (t && !values.includes(t)) {
      values.push(t);
      render();
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    values.splice(+b.dataset.i, 1);
    render();
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  sugg.addEventListener('click', (e) => {
    const b = e.target.closest('.chip-sugg');
    if (b) add(b.textContent);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(input.value);
      input.value = '';
    }
  });
  input.addEventListener('blur', () => {
    if (input.value.trim()) {
      add(input.value);
      input.value = '';
    }
  });
  render();
  el.getValues = () => {
    if (input.value.trim()) {
      add(input.value);
      input.value = '';
    }
    return values;
  };
  return el;
}

export function emptyState(text, sub = '') {
  return `<div class="empty"><p>${esc(text)}</p>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}</div>`;
}
