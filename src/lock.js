// Code d'accès à 6 chiffres : création, déverrouillage, verrouillage automatique, changement, code oublié.
import * as db from './db.js';
import * as vault from './vault.js';
import { icon } from './icons.js';
import { esc } from './util.js';
import { html } from './ui.js';

let V = null; // coffre (sel, secret protégé, compteur d'erreurs)
let el = null;
let locked = true;
let hiddenAt = 0;
let lockDelayMs = 60000;
let cover = null;

export const isLocked = () => locked;
export const setLockDelay = (sec) => (lockDelayMs = Math.max(0, Number(sec) || 0) * 1000);
export const lockDelay = () => lockDelayMs / 1000;

// Pause imposée après plusieurs codes faux (le compteur est gardé même si on relance l'appli).
function pauseFor(fails) {
  if (fails < 5) return 0;
  return [30, 60, 300, 900][fails - 5] * 1000 || 3600000;
}
function fmtWait(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${String(r).padStart(2, '0')} s` : `${m} min`;
}

function overlay() {
  if (!el) {
    el = html('<div id="lock" role="dialog" aria-modal="true" aria-label="Code d’accès"></div>');
    document.body.appendChild(el);
  }
  el.hidden = false;
  document.body.classList.add('locked');
  return el;
}
function hideOverlay() {
  if (!el) return;
  el.hidden = true;
  el.innerHTML = '';
  document.body.classList.remove('locked');
}

// Écran de saisie d'un code. `validate(code)` renvoie null si c'est bon, un message d'erreur sinon,
// ou { msg, until } pour bloquer le clavier jusqu'à une date.
function pinScreen({ title, sub = '', msg = '', validate = async () => null, cancelable = false, extra = '', onExtra, until = 0 }) {
  return new Promise((resolve) => {
    const root = overlay();
    root.innerHTML = `<div class="lock-box">
      <div class="lock-logo" aria-hidden="true"></div>
      <h2 class="lock-title">${esc(title)}</h2>
      <p class="lock-sub">${sub}</p>
      <div class="lock-dots" aria-hidden="true">${'<span></span>'.repeat(vault.PIN_LENGTH)}</div>
      <p class="lock-msg" aria-live="polite">${esc(msg)}</p>
      <div class="lock-pad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-k="${n}">${n}</button>`).join('')}
        <button type="button" class="lock-aux" data-cancel ${cancelable ? '' : 'style="visibility:hidden" tabindex="-1"'}>Annuler</button>
        <button type="button" data-k="0">0</button>
        <button type="button" class="lock-aux" data-back aria-label="Effacer le dernier chiffre">${icon('delKey', 28)}</button>
      </div>
      <div class="lock-extra">${extra}</div>
    </div>`;
    const dotsBox = root.querySelector('.lock-dots');
    const dots = [...dotsBox.children];
    const msgEl = root.querySelector('.lock-msg');
    let code = '';
    let wait = false;
    let timer = null;
    const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < code.length));
    const finish = (v) => {
      clearInterval(timer);
      document.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const pauseUntil = (t, text) => {
      wait = true;
      root.classList.add('waiting');
      const tick = () => {
        const left = t - Date.now();
        if (left <= 0) {
          clearInterval(timer);
          wait = false;
          root.classList.remove('waiting');
          msgEl.textContent = 'Tu peux réessayer.';
          return;
        }
        msgEl.textContent = `${text} Réessaie dans ${fmtWait(left)}.`;
      };
      clearInterval(timer);
      timer = setInterval(tick, 1000);
      tick();
    };
    const press = async (k) => {
      if (wait) return;
      if (k === 'back') {
        code = code.slice(0, -1);
        return paint();
      }
      if (code.length >= vault.PIN_LENGTH) return;
      code += k;
      paint();
      if (code.length < vault.PIN_LENGTH) return;
      wait = true;
      root.classList.add('busy');
      let r;
      try {
        r = await validate(code);
      } catch (e) {
        r = `Erreur : ${e.message || e}`;
      }
      root.classList.remove('busy');
      if (r == null) return finish(code);
      dotsBox.classList.remove('shake');
      void dotsBox.offsetWidth;
      dotsBox.classList.add('shake');
      code = '';
      paint();
      if (typeof r === 'object' && r.until) pauseUntil(r.until, r.msg || '');
      else {
        msgEl.textContent = typeof r === 'string' ? r : r.msg || '';
        wait = false;
      }
    };
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Escape' && cancelable) finish(null);
    };
    document.addEventListener('keydown', onKey);
    root.querySelector('.lock-box').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.k) press(b.dataset.k);
      else if (b.hasAttribute('data-back')) press('back');
      else if (b.hasAttribute('data-cancel')) finish(null);
      else if (onExtra) onExtra(b, finish);
    });
    if (until > Date.now()) pauseUntil(until, 'Trop d’essais.');
  });
}

// Écran d'information dans le même cadre (au-dessus de tout le reste).
function infoScreen({ title, body, buttons }) {
  return new Promise((resolve) => {
    const root = overlay();
    root.innerHTML = `<div class="lock-box lock-info">
      <div class="lock-logo" aria-hidden="true"></div>
      <h2 class="lock-title">${esc(title)}</h2>
      <div class="lock-text">${body}</div>
      <div class="lock-buttons">${buttons.map((b, i) => `<button type="button" class="btn ${b.kind ? 'btn-' + b.kind : 'btn-light'} btn-block" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>
    </div>`;
    root.querySelector('.lock-buttons').addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) resolve(buttons[+b.dataset.i].value);
    });
  });
}

function progressScreen(title, text) {
  const root = overlay();
  root.innerHTML = `<div class="lock-box lock-info"><div class="lock-logo" aria-hidden="true"></div><h2 class="lock-title">${esc(title)}</h2><p class="lock-text" data-progress>${esc(text)}</p><div class="lock-spinner" aria-hidden="true"></div></div>`;
  return (t) => {
    const p = root.querySelector('[data-progress]');
    if (p) p.textContent = t;
  };
}

// Vérifie un code en comptant les erreurs. Renvoie null si bon.
async function checkCode(code, { openVault }) {
  if (V.nextTry && V.nextTry > Date.now()) return { msg: 'Trop d’essais.', until: V.nextTry };
  const ok = openVault ? await vault.unlock(code, V) : await vault.verify(code, V);
  if (ok) {
    if (V.fails || V.nextTry) {
      V.fails = 0;
      V.nextTry = 0;
      await db.putVault(V);
    }
    return null;
  }
  V.fails = (V.fails || 0) + 1;
  const p = pauseFor(V.fails);
  V.nextTry = p ? Date.now() + p : 0;
  await db.putVault(V);
  if (p) return { msg: 'Code incorrect.', until: V.nextTry };
  const left = 5 - V.fails;
  return V.fails >= 3 ? `Code incorrect. Encore ${left} essai${left > 1 ? 's' : ''} avant une pause.` : 'Code incorrect.';
}

const FORGOT = '<button type="button" class="lock-link" data-forgot>Code oublié ?</button>';

async function askUnlock() {
  for (;;) {
    const code = await pinScreen({
      title: 'Entre ton code',
      sub: 'Prospection est verrouillée.',
      validate: (c) => checkCode(c, { openVault: true }),
      extra: FORGOT,
      until: V.nextTry || 0,
      onExtra: async (b, finish) => {
        if (b.hasAttribute('data-forgot')) finish('forgot');
      },
    });
    if (code !== 'forgot') return;
    await forgotFlow();
  }
}

async function forgotFlow() {
  const a = await infoScreen({
    title: 'Code oublié',
    body: `<p>Sans le code, personne ne peut lire les données de l’appli : c’est ce qui les protège.</p>
      <p>Pour repartir : efface les données de ce téléphone, crée un nouveau code, puis restaure ta dernière sauvegarde Excel (il te faudra son mot de passe).</p>`,
    buttons: [
      { label: 'Retour', value: false, kind: 'primary' },
      { label: 'Tout effacer…', value: true, kind: 'danger-light' },
    ],
  });
  if (!a) return;
  const b = await infoScreen({
    title: 'Tout effacer ?',
    body: '<p>Contacts, passages, relances, photos : tout ce qui est dans l’appli sur ce téléphone sera supprimé. Ce n’est pas annulable.</p>',
    buttons: [
      { label: 'Annuler', value: false, kind: 'light' },
      { label: 'Effacer définitivement', value: true, kind: 'danger' },
    ],
  });
  if (!b) return;
  progressScreen('Effacement…', 'Suppression des données de ce téléphone.');
  await db.wipe();
  try {
    sessionStorage.setItem('prospection-efface', '1');
  } catch {
    /* rien */
  }
  location.reload();
  await new Promise(() => {}); // la page se recharge
}

async function chooseNewCode({ title = 'Crée ton code', sub, cancelable = false }) {
  let msg = '';
  for (;;) {
    const first = await pinScreen({
      title,
      sub,
      msg,
      cancelable,
      validate: async (c) => (vault.codeTropSimple(c) ? 'Ce code est trop facile à deviner. Choisis-en un autre.' : null),
    });
    if (first == null) return null;
    const second = await pinScreen({ title: 'Confirme ton code', sub: 'Tape le même code une deuxième fois.', cancelable: true });
    if (second == null) {
      if (cancelable) return null;
      msg = '';
      continue;
    }
    if (second === first) return first;
    msg = 'Les deux codes étaient différents. Recommence.';
  }
}

// Au démarrage : création du code (première fois) ou déverrouillage. Résout quand les données sont lisibles.
export async function start() {
  V = await db.getVault();
  if (V) {
    await askUnlock();
  } else {
    const legacy = await db.hasPlainData();
    const pin = await chooseNewCode({
      sub: legacy
        ? 'Nouveau : l’appli se protège par un code à 6 chiffres, et tes données vont être chiffrées sur ce téléphone. Choisis un code différent de celui de ton iPhone.'
        : 'Il ouvre l’appli et chiffre tes données sur ce téléphone. Choisis un code différent de celui de ton iPhone.',
    });
    await infoScreen({
      title: 'Retiens bien ce code',
      body: '<p>Sans lui, les données de l’appli sont illisibles. En cas d’oubli, il faudra tout effacer sur ce téléphone et restaurer ta dernière sauvegarde.</p><p>Tu pourras le changer dans Tableau, rubrique Sécurité.</p>',
      buttons: [{ label: 'J’ai compris', value: true, kind: 'primary' }],
    });
    const setText = progressScreen('Chiffrement…', legacy ? 'Chiffrement de tes données sur ce téléphone.' : 'Préparation de l’appli.');
    const rec = await vault.createVault(pin);
    const r = await db.encryptExisting(rec, (k, n) => n > 400 && setText(`Chiffrement de tes données : ${Math.round((k / n) * 100)} %`));
    V = rec;
    if (r.lostPhotos) console.warn(`${r.lostPhotos} photo(s) illisible(s) non reprise(s)`);
  }
  locked = false;
  hideOverlay();
}

// Verrouillage automatique quand l'appli passe en arrière-plan, et cache pour l'aperçu des applis récentes.
export function arm() {
  cover = html('<div id="privacy-cover" aria-hidden="true"><div class="lock-logo"></div></div>');
  document.body.appendChild(cover);
  const hide = () => {
    if (!hiddenAt) hiddenAt = Date.now();
    document.body.classList.add('masque');
  };
  const show = () => {
    const away = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = 0;
    // Pas de verrouillage si un écran du code est déjà affiché (changement de code en cours).
    if (!locked && away > 0 && away >= lockDelayMs && (!el || el.hidden)) lockNow();
    document.body.classList.remove('masque');
  };
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? hide() : show()));
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
}

export async function lockNow() {
  if (locked) return;
  locked = true;
  document.activeElement?.blur?.();
  await askUnlock();
  locked = false;
  hideOverlay();
}

// Depuis les paramètres.
export async function changeCode() {
  const old = await pinScreen({ title: 'Code actuel', sub: 'Pour changer de code, tape d’abord le code actuel.', cancelable: true, validate: (c) => checkCode(c, { openVault: false }), until: V.nextTry || 0 });
  const stop = () => {
    hideOverlay();
    return false;
  };
  if (old == null) return stop();
  const pin = await chooseNewCode({ title: 'Nouveau code', sub: 'Choisis un code différent de celui de ton iPhone.', cancelable: true });
  if (pin == null) return stop();
  const nv = await vault.changePin(old, pin, V);
  if (!nv) return stop();
  await db.putVault(nv);
  V = nv;
  hideOverlay();
  return true;
}
