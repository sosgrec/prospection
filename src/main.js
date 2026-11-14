// Point d'entrée : chargement des données, onglets, sauvegarde, mise à jour de l'appli.
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { openDB, requestPersistence, unreadable } from './db.js';
import * as state from './state.js';
import { S, loadBase, loadUserData, onChange, getSetting } from './state.js';
import * as lock from './lock.js';
import { loadDvf } from './dvfUpdate.js';
import { icon } from './icons.js';
import { $, $$, html, toast, closeSheet, isDialogOpen, dialog } from './ui.js';
import { nav, register } from './nav.js';
import { initMap, mapResized } from './views/map.js';
import './views/address.js';
import './views/building.js';
import './views/contactPage.js';
import { initContacts } from './views/contacts.js';
import { initRelances, relancesBadge } from './views/relances.js';
import { initScenarios } from './views/scenarios.js';
import { initDashboard } from './views/dashboard.js';
import { exportBackup, backupAgeDays, hasUserData, restoreFromFile } from './backup.js';

globalThis.APP_VERSION = '__VERSION__';

const TABS = [
  ['carte', 'Carte', 'map'],
  ['contacts', 'Contacts', 'users'],
  ['relances', 'Relances', 'bell'],
  ['scenarios', 'Scénarios', 'script'],
  ['bord', 'Tableau', 'chart'],
];
let current = 'carte';

function goTab(name) {
  if (!TABS.some((t) => t[0] === name)) return;
  if (name !== 'carte') closeSheet();
  current = name;
  for (const s of $$('.tab')) s.classList.toggle('active', s.dataset.tab === name);
  for (const b of $$('#tabbar button')) b.classList.toggle('on', b.dataset.tab === name);
  const sec = $(`#tab-${name}`);
  sec.dispatchEvent(new Event('tab:show'));
  if (name === 'carte') mapResized();
}

function renderTabbar() {
  const n = relancesBadge();
  $('#tabbar').innerHTML = TABS.map(
    ([k, l, ic]) =>
      `<button type="button" data-tab="${k}" class="${k === current ? 'on' : ''}">${icon(ic, 25)}<span>${l}</span>${k === 'relances' && n ? `<span class="badge">${n}</span>` : ''}</button>`,
  ).join('');
}

function renderBanner() {
  const b = $('#banner');
  const age = backupAgeDays();
  const need = hasUserData() && (age == null || age > 7);
  b.hidden = !need;
  if (need) b.innerHTML = `${icon('alert', 18)}<span>${age == null ? 'Aucune sauvegarde de tes données pour l’instant.' : `Dernière sauvegarde il y a ${age} jours.`}</span><button type="button" data-export>Exporter</button>`;
}

// ---------- Mise à jour de l'appli : fenêtre au centre, impossible à ignorer ----------
let waitingWorker = null;
let updateShown = false;
// On attend que la saisie en cours soit enregistrée ou fermée, pour ne rien perdre.
const busyEditing = () => $$('#pages .page.dirty').length > 0 || isDialogOpen();

function showUpdate(worker) {
  waitingWorker = worker;
  if (updateShown) return;
  if (busyEditing()) {
    setTimeout(() => showUpdate(waitingWorker), 1500);
    return;
  }
  updateShown = true;
  document.activeElement?.blur?.();
  const el = html(`<div id="update-modal" role="alertdialog" aria-modal="true" aria-labelledby="update-title">
      <div class="update-box">
        <div class="lock-logo" aria-hidden="true"></div>
        <h2 id="update-title">Mise à jour disponible</h2>
        <p>Une nouvelle version de l’appli est prête. Installe-la pour continuer : tes données restent sur ce téléphone.</p>
        <button type="button" class="btn btn-primary btn-block" data-update>Mettre à jour</button>
      </div>
    </div>`);
  document.body.appendChild(el);
  el.querySelector('[data-update]').addEventListener('click', (e) => {
    e.currentTarget.disabled = true;
    e.currentTarget.textContent = 'Mise à jour…';
    waitingWorker?.postMessage('skipWaiting');
    // Si la nouvelle version ne prend pas la main d'elle-même, on recharge.
    setTimeout(() => location.reload(), 4000);
  });
}

async function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w);
      });
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
    // Vérifie les mises à jour au retour dans l'appli
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  } catch (e) {
    console.warn('Service worker non enregistré', e);
  }
}

async function boot() {
  const msg = $('#boot-msg');
  // Dès le démarrage, même écran du code affiché : une correction de l'appli doit toujours pouvoir arriver.
  registerSW();
  try {
    await openDB();
    const base = loadBase(); // données publiques de la carte, chargées pendant la saisie du code
    base.catch(() => {});
    await lock.start();
    msg.textContent = 'Ouverture des données…';
    await base;
    await loadUserData();
    lock.setLockDelay(getSetting('lockDelay', 60));
    await loadDvf();
    msg.textContent = 'Préparation de la carte…';
    register({ goTab });
    renderTabbar();
    initMap($('#tab-carte'));
    initContacts($('#tab-contacts'));
    initRelances($('#tab-relances'));
    initScenarios($('#tab-scenarios'));
    initDashboard($('#tab-bord'));
    renderBanner();
    onChange(() => {
      renderTabbar();
      renderBanner();
    });
    $('#tabbar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) goTab(b.dataset.tab);
    });
    $('#banner').addEventListener('click', (e) => {
      if (e.target.closest('[data-export]')) exportBackup().then(renderBanner);
    });
    requestPersistence();
    lock.arm();
    $('#boot').classList.add('out');
    setTimeout(() => $('#boot').remove(), 400);
    if (unreadable) toast(`${unreadable} élément(s) illisible(s) ignoré(s)`);
    afterWipe();
  } catch (e) {
    console.error(e);
    msg.innerHTML = `Impossible de démarrer : ${String(e.message || e)}<br><br><button type="button" onclick="location.reload()" style="color:#1d4ed8;font-weight:700">Réessayer</button>`;
  }
}

// Après « Code oublié » : proposer tout de suite de restaurer la sauvegarde.
function afterWipe() {
  let flag = null;
  try {
    flag = sessionStorage.getItem('prospection-efface');
    sessionStorage.removeItem('prospection-efface');
  } catch {
    /* rien */
  }
  if (!flag) return;
  dialog({
    title: 'Données effacées',
    body: '<p>Ton nouveau code est en place. Restaure maintenant ta dernière sauvegarde Excel pour retrouver tes données.</p>',
    buttons: [
      { label: 'Plus tard', value: false, kind: 'light' },
      { label: 'Restaurer', value: true, kind: 'primary' },
    ],
  }).then((v) => v && restoreFromFile());
}

window.addEventListener('error', (e) => {
  if (String(e.message || '').includes('ResizeObserver')) return;
  toast('Erreur : ' + (e.message || 'inconnue'));
});
window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  toast('Erreur : ' + (e.reason?.message || e.reason || 'inconnue'));
});

globalThis.__app = { S, nav, state }; // utile pour les tests automatisés
boot();
