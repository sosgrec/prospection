// Point d'entrée : chargement des données, onglets, sauvegarde, mise à jour de l'appli.
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { openDB, requestPersistence } from './db.js';
import { S, loadBase, loadUserData, onChange } from './state.js';
import { loadDvf } from './dvfUpdate.js';
import { icon } from './icons.js';
import { $, $$, toast, closeSheet } from './ui.js';
import { nav, register } from './nav.js';
import { initMap, mapResized } from './views/map.js';
import './views/address.js';
import './views/building.js';
import './views/contactPage.js';
import { initContacts } from './views/contacts.js';
import { initRelances, relancesBadge } from './views/relances.js';
import { initScenarios } from './views/scenarios.js';
import { initDashboard } from './views/dashboard.js';
import { exportBackup, backupAgeDays, hasUserData } from './backup.js';

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

async function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    const prompt = (w) =>
      toast('Nouvelle version de l’appli disponible', {
        action: 'Mettre à jour',
        ms: 30000,
        onAction: () => w.postMessage('skipWaiting'),
      });
    if (reg.waiting && navigator.serviceWorker.controller) prompt(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) prompt(w);
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
  try {
    msg.textContent = 'Ouverture des données…';
    await openDB();
    await loadBase();
    await loadUserData();
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
    $('#boot').classList.add('out');
    setTimeout(() => $('#boot').remove(), 400);
  } catch (e) {
    console.error(e);
    msg.innerHTML = `Impossible de démarrer : ${String(e.message || e)}<br><br><button type="button" onclick="location.reload()" style="color:#1d4ed8;font-weight:700">Réessayer</button>`;
  }
  registerSW();
}

window.addEventListener('error', (e) => {
  if (String(e.message || '').includes('ResizeObserver')) return;
  toast('Erreur : ' + (e.message || 'inconnue'));
});
window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  toast('Erreur : ' + (e.reason?.message || e.reason || 'inconnue'));
});

globalThis.__app = { S, nav }; // utile pour les tests automatisés
boot();
