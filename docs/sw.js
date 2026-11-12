// Service worker de Prospection : appli disponible hors connexion.
const VERSION = '2026-11-12-38172879';
const PRECACHE = ["./","./app.css","./app.js","./data/base.json","./data/dvf.json","./icons/apple-touch-icon.png","./icons/icon-192.png","./icons/icon-512-maskable.png","./icons/icon-512.png","./icons/icon.svg","./index.html","./js/chunk-7H7ASX2S.js","./js/chunk-FRHTUXF2.js","./js/chunk-VV34GD54.js","./js/jspdf.es.min-LTBQVQCB.js","./js/jspdf.plugin.autotable-37NXD42Y.js","./js/pdf-PZHHATOR.js","./manifest.webmanifest"];
const APP_CACHE = `prospection-app-${VERSION}`;
const TILE_CACHE = 'prospection-tuiles';
const MAX_TILES = 2500;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('prospection-app-') && k !== APP_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

function fromB64url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(u8);
}

// Événement de calendrier généré par l'appli (relance) servi avec le bon type de fichier.
function icsResponse(url) {
  let body = '';
  try {
    body = fromB64url(url.searchParams.get('d') || '');
  } catch {
    return new Response('Événement invalide', { status: 400 });
  }
  return new Response(body, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="relance.ics"' } });
}

async function tile(request) {
  const cache = await caches.open(TILE_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') {
    cache.put(request, res.clone());
    cache.keys().then((keys) => {
      if (keys.length > MAX_TILES) for (const k of keys.slice(0, keys.length - MAX_TILES)) cache.delete(k);
    });
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/calendrier.ics')) return event.respondWith(icsResponse(url));
    if (url.searchParams.has('frais')) return event.respondWith(fetch(req, { cache: 'no-store' }));
    if (req.mode === 'navigate') {
      // Coquille de l'appli toujours servie depuis le cache : démarrage instantané même avec un réseau faible.
      return event.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    }
    return event.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
  }
  if (url.hostname === 'data.geopf.fr' && url.pathname.startsWith('/wmts')) return event.respondWith(tile(req));
});
