// Onglet Carte : cadastre des 9 îlots, adresses colorées, filtres, ventes DVF, position.
import L from 'leaflet';
import { icon } from '../icons.js';
import { esc, fmtDate, fmtEuro, fmtNum, pointInPolygon, startOfWeek, todayStr, DAY, plural } from '../util.js';
import { html, $, $$, dialog, openSheet, closeSheet, getSheet, toast } from '../ui.js';
import {
  S,
  onChange,
  addressColor,
  isImmeuble,
  isVisited,
  interestOfAddress,
  signalsOf,
  hasVendeurPotentiel,
  passagesOfAddress,
  absentsARepasser,
  relancesActives,
  contactAddressLinks,
  addrLabel,
  ilotName,
  COLORS,
  getSetting,
  setSetting,
  searchAddresses,
  searchContacts,
  contactDisplay,
  contactColor,
  addrUser,
  saveAddrUser,
  linksOfAddress,
} from '../state.js';
import { nav, register } from '../nav.js';
import { V, NATURE_LABEL } from '../dvfParse.js';

let map;
let R; // canvas des pastilles (adresses, ventes)
let RB; // canvas du cadastre (bâtiments, parcelles)
let RI; // canvas des contours d'îlots
const layers = {};
let markers = []; // { a, m }
let markerById = new Map();
let parcelIndex = []; // { i, rings, bb, ilot, id, cont }
let parcelAddrs = new Map();
let selectedId = null;
let filters = { absents: false, relances: false, nonVisitees: null, signaux: false, vendeurs: false, chauds: false, couleurs: [], tag: '' };
let showDvf = false;
let dvfYears = 3;
let basemap = 'cadastre';
let meMarker = null;
let meCircle = null;
let watchId = null;
let firstFix = false;

// ---------- Dessin des pastilles d'adresse sur le canvas ----------
const REP_SHORT = { bis: 'b', ter: 't', quater: 'q' };
function shortNum(a) {
  if (!a.rep) return a.num;
  return a.num + (REP_SHORT[a.rep.toLowerCase()] || a.rep.toLowerCase().slice(0, 2));
}

function starPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    const px = x + Math.cos(ang) * rr;
    const py = y + Math.sin(ang) * rr;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

L.Canvas.include({
  _updateAddr(layer) {
    if (!this._drawing || layer._empty()) return;
    const st = layer.options.st;
    if (!st || st.hidden) return;
    const ctx = this._ctx;
    const p = layer._point;
    const r = Math.max(layer._radius, 1);
    ctx.save();
    ctx.globalAlpha = 1;
    // Forme : carré arrondi pour un immeuble, rond sinon
    ctx.beginPath();
    if (st.square) {
      const s = r * 0.95;
      const rad = Math.min(4, s * 0.4);
      ctx.moveTo(p.x - s + rad, p.y - s);
      ctx.arcTo(p.x + s, p.y - s, p.x + s, p.y + s, rad);
      ctx.arcTo(p.x + s, p.y + s, p.x - s, p.y + s, rad);
      ctx.arcTo(p.x - s, p.y + s, p.x - s, p.y - s, rad);
      ctx.arcTo(p.x - s, p.y - s, p.x + s, p.y - s, rad);
      ctx.closePath();
    } else ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = st.hollow ? '#ffffff' : st.fill;
    ctx.fill();
    ctx.lineWidth = st.hollow ? Math.max(1.5, r * 0.28) : r > 6 ? 1.6 : 1;
    ctx.strokeStyle = st.hollow ? st.fill : '#ffffff';
    ctx.stroke();
    if (st.selected) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#111827';
      ctx.stroke();
    }
    // Numéro dans la pastille aux forts zooms
    if (st.label && r >= 9) {
      const txt = st.label;
      const fs = Math.max(8, Math.min(r * 0.95, 12.5) - (txt.length > 3 ? 1.5 : 0));
      ctx.font = `700 ${fs}px -apple-system, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = st.hollow ? '#374151' : '#ffffff';
      ctx.fillText(txt, p.x, p.y + 0.5);
    }
    // Étoile d'intérêt
    if (st.star && r >= 3.5) {
      const sr = Math.max(4.5, r * 0.62);
      const sx = p.x + r * 0.85;
      const sy = p.y - r * 0.85;
      starPath(ctx, sx, sy, sr);
      ctx.fillStyle = st.star === 2 ? '#e8a400' : '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = st.star === 2 ? '#ffffff' : '#e8a400';
      ctx.stroke();
    }
    // Pastille « ! » : signal de vente ou propriétaire installé depuis 7 à 10 ans
    if (st.signal && r >= 4.5) {
      const br = Math.max(4.5, r * 0.5);
      const bx = p.x - r * 0.85;
      const by = p.y - r * 0.85;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fillStyle = '#7c3aed';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${br * 1.5}px -apple-system, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', bx, by + 0.5);
    }
    ctx.restore();
  },
  _updateDvf(layer) {
    if (!this._drawing || layer._empty()) return;
    const st = layer.options.st;
    const ctx = this._ctx;
    const p = layer._point;
    const r = layer._radius;
    ctx.save();
    ctx.globalAlpha = st.alpha;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - r);
    ctx.lineTo(p.x + r, p.y);
    ctx.lineTo(p.x, p.y + r);
    ctx.lineTo(p.x - r, p.y);
    ctx.closePath();
    ctx.fillStyle = st.fill;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    if (st.count > 1 && r >= 7) {
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${r * 0.9}px -apple-system, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(st.count), p.x, p.y + 0.5);
    }
    ctx.restore();
  },
});

const AddrMarker = L.CircleMarker.extend({
  _updatePath() {
    this._renderer._updateAddr(this);
  },
  _updateBounds() {
    const r = this._radius + 14;
    const p = this._point;
    this._pxBounds = new L.Bounds(p.subtract([r, r]), p.add([r, r]));
  },
  _containsPoint() {
    return false;
  },
});
const DvfMarker = L.CircleMarker.extend({
  _updatePath() {
    this._renderer._updateDvf(this);
  },
  _containsPoint() {
    return false;
  },
});

// ---------- Styles ----------
const radiusFor = (z) => (z < 15 ? 2.5 : z < 16 ? 3.5 : z < 17 ? 5 : z < 18 ? 7 : z < 19 ? 9.5 : z < 20 ? 12 : 14);

function matchesFilters(id) {
  const f = filters;
  if (f.couleurs.length && !f.couleurs.includes(addressColor(id))) return false;
  if (f.absents && !absentSet().has(id)) return false;
  if (f.relances && !relanceSet().has(id)) return false;
  if (f.nonVisitees != null) {
    const ps = passagesOfAddress(id);
    if (f.nonVisitees === 0) {
      if (ps.length) return false;
    } else if (ps.length && ps[0].t > Date.now() - f.nonVisitees * 7 * DAY) return false;
  }
  if (f.signaux && !signalsOf(id).length) return false;
  if (f.vendeurs && !hasVendeurPotentiel(id)) return false;
  if (f.chauds && interestOfAddress(id) < 2) return false;
  if (f.tag) {
    const tags = new Set(addrUser(id).tags || []);
    for (const l of linksOfAddress(id)) for (const t of S.contacts.get(l.contactId)?.tags || []) tags.add(t);
    if (!tags.has(f.tag)) return false;
  }
  return true;
}
let _absentSet = null;
let _relanceSet = null;
const absentSet = () => (_absentSet ||= new Set(absentsARepasser().map((x) => x.addressId)));
function relanceSet() {
  if (_relanceSet) return _relanceSet;
  const t = todayStr();
  const s = new Set();
  for (const r of relancesActives()) {
    if (r.date > t) continue;
    if (r.addressId) s.add(r.addressId);
    if (r.contactId) for (const l of contactAddressLinks(r.contactId)) s.add(l.addressId);
  }
  return (_relanceSet = s);
}
export const activeFilterCount = () =>
  (filters.absents ? 1 : 0) +
  (filters.relances ? 1 : 0) +
  (filters.nonVisitees != null ? 1 : 0) +
  (filters.signaux ? 1 : 0) +
  (filters.vendeurs ? 1 : 0) +
  (filters.chauds ? 1 : 0) +
  (filters.couleurs.length ? 1 : 0) +
  (filters.tag ? 1 : 0);

function styleFor(a) {
  const col = addressColor(a.id);
  return {
    fill: COLORS[col].hex,
    square: col === 'bleu' || isImmeuble(a.id),
    hollow: col === 'gris' && !isVisited(a.id),
    star: interestOfAddress(a.id),
    signal: signalsOf(a.id).length > 0 || hasVendeurPotentiel(a.id),
    label: shortNum(a),
    selected: a.id === selectedId,
    hidden: !matchesFilters(a.id),
  };
}

function restyleAll() {
  _absentSet = null;
  _relanceSet = null;
  for (const { a, m } of markers) m.options.st = styleFor(a);
  if (R && R._map) R._redraw();
  renderFilterBar();
}

function syncMarkers() {
  // Retire les adresses supprimées, ajoute celles saisies à la main
  if (markers.length > S.addrs.size || markers.some(({ a }) => !S.addrs.has(a.id))) {
    markers = markers.filter(({ a, m }) => {
      if (S.addrs.has(a.id)) return true;
      layers.addr.removeLayer(m);
      markerById.delete(a.id);
      return false;
    });
  }
  for (const a of S.addrs.values()) {
    if (markerById.has(a.id)) continue;
    const m = new AddrMarker([a.lat, a.lon], { renderer: R, radius: radiusFor(map.getZoom()), interactive: false });
    m.options.st = styleFor(a);
    m.addTo(layers.addr);
    markers.push({ a, m });
    markerById.set(a.id, m);
  }
}

// ---------- Construction de la carte ----------
const IGN = (layer, fmt) =>
  `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=normal&TILEMATRIXSET=PM&FORMAT=${fmt}&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;

function buildLayers() {
  const b = S.base;
  layers.tiles = {
    plan: L.tileLayer(IGN('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png'), { maxNativeZoom: 19, maxZoom: 20, attribution: '© IGN Géoplateforme' }),
    photo: L.tileLayer(IGN('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg'), { maxNativeZoom: 19, maxZoom: 20, attribution: '© IGN Géoplateforme' }),
  };
  layers.bati = L.layerGroup();
  layers.parc = L.layerGroup();
  layers.ilots = L.layerGroup();
  layers.ilotLabels = L.layerGroup();
  layers.rues = L.layerGroup();
  layers.addr = L.layerGroup();
  layers.dvf = L.layerGroup();
  layers.me = L.layerGroup();

  for (const [il, rings, leger] of b.batiments) {
    L.polygon(
      rings.map((r) => r.map(([x, y]) => [y, x])),
      { renderer: RB, interactive: false, stroke: true, weight: 0.6, color: il ? '#b3ab9e' : '#d3cdc3', fillColor: il ? (leger ? '#e7e2d9' : '#dcd5c9') : '#ebe7e0', fillOpacity: 1 },
    ).addTo(layers.bati);
  }
  b.parcelles.forEach(([id, cont, il, rings], i) => {
    const latlngs = rings.map((r) => r.map(([x, y]) => [y, x]));
    const pl = L.polygon(latlngs, { renderer: RB, interactive: false, weight: il ? 0.8 : 0.5, color: il ? '#a39d92' : '#cbc6bd', fill: false });
    pl.addTo(layers.parc);
    let bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of rings[0]) bb = [Math.min(bb[0], x), Math.min(bb[1], y), Math.max(bb[2], x), Math.max(bb[3], y)];
    parcelIndex.push({ i, id, cont, ilot: il, rings, bb, layer: pl });
  });
  for (const il of b.ilots) {
    L.polygon(
      il.ring.map(([x, y]) => [y, x]),
      { renderer: RI, interactive: false, color: '#dc2626', weight: 2.5, fillColor: '#dc2626', fillOpacity: 0.04 },
    ).addTo(layers.ilots);
    const c = il.ring.reduce((s, [x, y]) => [s[0] + x / il.ring.length, s[1] + y / il.ring.length], [0, 0]);
    L.marker([c[1], c[0]], {
      pane: 'labelPane',
      interactive: false,
      icon: L.divIcon({ className: '', html: `<div class="ilot-label" style="transform:translate(-50%,-50%)"><span class="il-num">${il.id}</span><span class="il-name"> · ${esc(il.nom)}</span></div>`, iconSize: [0, 0] }),
    }).addTo(layers.ilotLabels);
  }
  for (const [v, lon, lat, deg] of b.rues) {
    L.marker([lat, lon], {
      pane: 'labelPane',
      interactive: false,
      icon: L.divIcon({ className: '', html: `<div class="street-label" style="transform:translate(-50%,-50%) rotate(${deg}deg)">${esc(b.voies[v])}</div>`, iconSize: [0, 0] }),
    }).addTo(layers.rues);
  }
  for (const a of S.addrs.values()) {
    for (const pi of a.parcels || []) {
      if (!parcelAddrs.has(pi)) parcelAddrs.set(pi, []);
      parcelAddrs.get(pi).push(a.id);
    }
  }
}

function applyZoomVisibility() {
  const z = map.getZoom();
  const toggle = (layer, on) => (on ? map.hasLayer(layer) || map.addLayer(layer) : map.hasLayer(layer) && map.removeLayer(layer));
  toggle(layers.ilotLabels, z < 16);
  map.getContainer().classList.toggle('far', z < 14);
  toggle(layers.addr, z >= 15);
  toggle(layers.rues, z >= 16 && basemap === 'cadastre');
  const wantBati = basemap === 'cadastre' && z >= 15;
  if (wantBati && !map.hasLayer(layers.bati) && map.hasLayer(layers.parc)) map.removeLayer(layers.parc); // bâtiments sous les parcelles
  toggle(layers.bati, wantBati);
  toggle(layers.parc, z >= 16);
  const r = radiusFor(z);
  for (const { m } of markers) m.setRadius(r);
  for (const m of dvfMarkers) m.setRadius(Math.max(4, r * 0.75));
}

function setBasemap(mode) {
  basemap = mode;
  for (const [k, t] of Object.entries(layers.tiles)) {
    if (k === mode) map.addLayer(t);
    else if (map.hasLayer(t)) map.removeLayer(t);
  }
  for (const p of parcelIndex) p.layer.setStyle({ color: mode === 'photo' ? (p.ilot ? '#fef3c7' : '#e5e7eb') : p.ilot ? '#a39d92' : '#cbc6bd', weight: mode === 'photo' ? 0.9 : p.ilot ? 0.8 : 0.5 });
  applyZoomVisibility();
  setSetting('basemap', mode);
}

// ---------- Ventes DVF ----------
let dvfMarkers = [];
const DVF_COLORS = { Maison: '#9333ea', Appartement: '#0d9488', Terrain: '#92400e', 'Plusieurs biens': '#475569' };
function buildDvf() {
  layers.dvf.clearLayers();
  dvfMarkers = [];
  const data = S.dvf;
  if (!data) return;
  const minYear = new Date().getFullYear() - dvfYears;
  const groups = new Map();
  for (const v of data.ventes) {
    if (+v[V.date].slice(0, 4) < minYear) continue;
    const k = `${v[V.lon].toFixed(5)},${v[V.lat].toFixed(5)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(v);
  }
  for (const vs of groups.values()) {
    const v = vs[0];
    const age = (Date.now() - new Date(v[V.date]).getTime()) / (365 * DAY);
    const m = new DvfMarker([v[V.lat], v[V.lon]], { renderer: R, radius: Math.max(4, radiusFor(map.getZoom()) * 0.75), interactive: false });
    m.options.st = { fill: DVF_COLORS[v[V.type]] || '#475569', alpha: age < 1 ? 1 : age < 2 ? 0.85 : 0.65, count: vs.length };
    m.ventes = vs;
    m.addTo(layers.dvf);
    dvfMarkers.push(m);
  }
}
function toggleDvf(on) {
  showDvf = on;
  if (on) {
    buildDvf();
    map.addLayer(layers.dvf);
  } else map.removeLayer(layers.dvf);
  $('[data-fab="dvf"]')?.classList.toggle('on', on);
  renderLegend();
}

export function venteHTML(v) {
  const prixM2 = v[V.surface] && v[V.nb] === 1 ? v[V.prix] / v[V.surface] : null;
  const details = [v[V.type], v[V.surface] ? `${v[V.surface]} m²` : '', v[V.pieces] ? plural(v[V.pieces], 'pièce', 'pièces') : '', v[V.terrain] ? `terrain ${fmtNum(v[V.terrain])} m²` : '']
    .filter(Boolean)
    .join(' · ');
  return `<div class="li" style="padding:10px 0"><span class="li-main"><span class="li-title">${fmtEuro(v[V.prix])}${prixM2 ? ` <span class="muted small">· ${fmtEuro(prixM2)}/m²</span>` : ''}</span>
    <span class="li-sub" style="white-space:normal">${esc(details)}</span>
    <span class="li-sub">${fmtDate(v[V.date])} · ${esc(NATURE_LABEL[v[V.nature]] || '')}${v[V.adresse] ? ' · ' + esc(v[V.adresse]) : ''}</span></span></div>`;
}

function openDvfSheet(ventes) {
  selectAddress(null);
  openSheet({
    content: `<h2>${ventes.length > 1 ? `${ventes.length} ventes` : 'Vente'} à cet endroit</h2><div class="sheet-sub">Source : DVF (données publiques des notaires et de la DGFiP)</div>${ventes.map(venteHTML).join('')}`,
  });
}

// ---------- Interactions ----------
function addressesNear(containerPoint, maxPx) {
  const out = [];
  const bounds = map.getBounds().pad(0.05);
  for (const { a, m } of markers) {
    if (m.options.st?.hidden) continue;
    if (!bounds.contains([a.lat, a.lon])) continue;
    const p = map.latLngToContainerPoint([a.lat, a.lon]);
    const d = p.distanceTo(containerPoint);
    if (d <= maxPx) out.push({ a, d, p });
  }
  return out.sort((x, y) => x.d - y.d);
}

function openChooser(list) {
  selectAddress(null);
  const content = html(`<div><h2>Plusieurs adresses ici</h2><div class="sheet-sub">Choisis celle qui t’intéresse.</div>
    <div class="list" style="margin:8px 0 0">${list
      .map((x) => `<button type="button" class="li" data-addr="${esc(x.a.id)}"><span class="dot ${addressColor(x.a.id)}"></span><span class="li-main"><span class="li-title">${esc(addrLabel(x.a))}</span></span>${icon('chevron', 18, 'chev')}</button>`)
      .join('')}</div></div>`);
  content.addEventListener('click', (e) => {
    const b = e.target.closest('[data-addr]');
    if (b) nav.openAddress(b.dataset.addr);
  });
  openSheet({ content });
}

function nearestAddress(containerPoint, maxPx) {
  let best = null;
  let bestD = maxPx;
  const bounds = map.getBounds().pad(0.05);
  for (const { a, m } of markers) {
    if (m.options.st?.hidden) continue;
    if (!bounds.contains([a.lat, a.lon])) continue;
    const p = map.latLngToContainerPoint([a.lat, a.lon]);
    const d = p.distanceTo(containerPoint);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best ? { a: best, d: bestD } : null;
}
function nearestDvf(containerPoint, maxPx) {
  let best = null;
  let bestD = maxPx;
  for (const m of dvfMarkers) {
    const d = map.latLngToContainerPoint(m.getLatLng()).distanceTo(containerPoint);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best ? { m: best, d: bestD } : null;
}
function parcelAt(lon, lat) {
  for (const p of parcelIndex) {
    if (lon < p.bb[0] || lon > p.bb[2] || lat < p.bb[1] || lat > p.bb[3]) continue;
    if (pointInPolygon(lon, lat, p.rings)) return p;
  }
  return null;
}

let hlParcel = null;
function highlightParcel(p) {
  if (hlParcel) {
    map.removeLayer(hlParcel);
    hlParcel = null;
  }
  if (!p) return;
  hlParcel = L.polygon(
    p.rings.map((r) => r.map(([x, y]) => [y, x])),
    { renderer: RI, interactive: false, color: '#1d4ed8', weight: 2.5, fillColor: '#1d4ed8', fillOpacity: 0.12 },
  ).addTo(map);
}

function onMapClick(e) {
  const cp = e.containerPoint;
  const z = map.getZoom();
  const tol = z >= 18 ? 22 : 18;
  const na = z >= 15 ? nearestAddress(cp, tol) : null;
  const nd = showDvf ? nearestDvf(cp, 16) : null;
  if (nd && (!na || nd.d + 4 < na.d)) {
    highlightParcel(null);
    return openDvfSheet(nd.m.ventes);
  }
  if (na) {
    highlightParcel(null);
    // Adresses superposées : on propose de choisir plutôt que de deviner
    const near = addressesNear(cp, tol + 8);
    const first = near[0];
    const close = near.filter((x) => x.d <= first.d + 9 && x.p.distanceTo(first.p) < Math.max(12, radiusFor(z) * 1.6));
    if (close.length > 1) return openChooser(close);
    return nav.openAddress(na.a.id);
  }
  if (z < 16) {
    closeSheet();
    return;
  }
  const p = parcelAt(e.latlng.lng, e.latlng.lat);
  if (!p) {
    closeSheet();
    highlightParcel(null);
    selectAddress(null);
    return;
  }
  const ids = parcelAddrs.get(p.i) || [];
  if (ids.length === 1) {
    highlightParcel(null);
    return nav.openAddress(ids[0]);
  }
  highlightParcel(p);
  selectAddress(null);
  openParcelSheet(p, ids, e.latlng);
}

function parcelLabel(p) {
  const id = p.id || '';
  const section = id.slice(8, 10).replace(/^0/, '');
  const num = String(parseInt(id.slice(10), 10) || '');
  return `Parcelle ${section} ${num}`;
}

function openParcelSheet(p, ids, latlng) {
  const sales = S.dvf ? S.dvf.ventes.filter((v) => v[V.parcelle] === p.id) : [];
  const content = html(`<div>
    <h2>${esc(parcelLabel(p))}</h2>
    <div class="sheet-sub">${p.cont ? `${fmtNum(p.cont)} m² · ` : ''}${esc(ilotName(p.ilot))}</div>
    ${
      ids.length
        ? `<div class="list" style="margin:8px 0">${ids
            .map((id) => `<button type="button" class="li" data-addr="${esc(id)}"><span class="dot ${addressColor(id)}"></span><span class="li-main"><span class="li-title">${esc(addrLabel(id))}</span></span>${icon('chevron', 18, 'chev')}</button>`)
            .join('')}</div>`
        : `<p class="muted">Aucune adresse connue sur cette parcelle.</p>`
    }
    <button type="button" class="btn btn-light btn-block" data-add>${icon('plus', 20)} Ajouter une adresse ici</button>
    ${sales.length ? `<div class="section-title" style="margin:16px 0 4px">Ventes sur cette parcelle</div>${sales.map(venteHTML).join('')}` : ''}
  </div>`);
  content.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-addr]');
    if (b) return nav.openAddress(b.dataset.addr);
    if (ev.target.closest('[data-add]')) addCustomAddress(latlng, p);
  });
  openSheet({ content, onClose: () => highlightParcel(null) });
}

async function addCustomAddress(latlng, parcel) {
  const nearVoies = [...new Set([...S.addrs.values()].filter((a) => Math.abs(a.lat - latlng.lat) < 0.0015 && Math.abs(a.lon - latlng.lng) < 0.002).map((a) => a.voie))].sort();
  const r = await dialog({
    title: 'Ajouter une adresse',
    body: `<div class="grid2"><label class="field"><span>Numéro</span><input data-num inputmode="numeric" /></label><label class="field"><span>Complément</span><input data-rep placeholder="bis, ter, A…" /></label></div>
      <label class="field"><span>Voie</span><input data-voie list="voies-proches" placeholder="Rue…" /><datalist id="voies-proches">${nearVoies.map((v) => `<option value="${esc(v)}">`).join('')}</datalist></label>`,
    buttons: [
      { label: 'Annuler', value: null, kind: 'light' },
      { label: 'Ajouter', kind: 'primary', value: (b) => ({ num: $('[data-num]', b).value.trim(), rep: $('[data-rep]', b).value.trim(), voie: $('[data-voie]', b).value.trim() }) },
    ],
  });
  if (!r || !r.voie) return;
  let ilot = parcel?.ilot || 0;
  if (!ilot) for (const il of S.base.ilots) if (pointInPolygon(latlng.lng, latlng.lat, [il.ring])) ilot = il.id;
  const id = 'perso-' + Date.now().toString(36);
  await saveAddrUser({ id, custom: true, num: r.num, rep: r.rep, voie: r.voie, lon: latlng.lng, lat: latlng.lat, ilot });
  if (parcel) {
    if (!parcelAddrs.has(parcel.i)) parcelAddrs.set(parcel.i, []);
    parcelAddrs.get(parcel.i).push(id);
  }
  syncMarkers();
  restyleAll();
  highlightParcel(null);
  nav.openAddress(id);
  toast('Adresse ajoutée');
}

export function selectAddress(id) {
  selectedId = id;
  restyleAll();
}

export function focusAddress(id, { open = true, zoom = 18 } = {}) {
  const a = S.addrs.get(id);
  if (!a) return;
  nav.goTab('carte');
  setTimeout(() => {
    map.invalidateSize();
    map.setView([a.lat, a.lon], Math.max(map.getZoom(), zoom), { animate: false });
    if (open) {
      map.panBy([0, Math.round(map.getSize().y * 0.22)], { animate: false });
      nav.openAddress(id);
    }
  }, 60);
}

// Fait remonter une adresse au-dessus de la feuille du bas si elle est cachée.
export function ensureVisible(id, sheetHeight) {
  const a = S.addrs.get(id);
  if (!a || !map) return;
  const p = map.latLngToContainerPoint([a.lat, a.lon]);
  const limit = map.getSize().y - sheetHeight - 30;
  if (p.y > limit) map.panBy([0, p.y - limit + 20], { animate: true });
}

// ---------- Position ----------
function toggleLocate() {
  const btn = $('[data-fab="locate"]');
  if (watchId != null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    layers.me.clearLayers();
    meMarker = meCircle = null;
    btn.classList.remove('on');
    return;
  }
  if (!navigator.geolocation) return toast('Localisation indisponible sur cet appareil');
  btn.classList.add('on');
  firstFix = true;
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      if (!meMarker) {
        meCircle = L.circle(ll, { radius: pos.coords.accuracy, renderer: RI, interactive: false, color: '#2563eb', weight: 1, fillOpacity: 0.08 }).addTo(layers.me);
        meMarker = L.marker(ll, { interactive: false, icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(layers.me);
      } else {
        meMarker.setLatLng(ll);
        meCircle.setLatLng(ll).setRadius(pos.coords.accuracy);
      }
      if (firstFix) {
        firstFix = false;
        map.setView(ll, Math.max(map.getZoom(), 18));
      }
    },
    (err) => {
      toast(err.code === 1 ? 'Autorise la localisation pour Prospection dans les réglages' : 'Position introuvable pour le moment');
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
      btn.classList.remove('on');
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
  );
}

// ---------- Panneaux : filtres, fonds, îlots, recherche ----------
function renderFilterBar() {
  const bar = $('.filter-bar');
  if (!bar) return;
  const labels = [];
  if (filters.absents) labels.push(['absents', 'Absents à repasser']);
  if (filters.relances) labels.push(['relances', 'Relances du jour']);
  if (filters.nonVisitees != null) labels.push(['nonVisitees', filters.nonVisitees === 0 ? 'Jamais visitées' : `Non visitées depuis ${Math.round(filters.nonVisitees / 4.3)} mois`]);
  if (filters.signaux) labels.push(['signaux', 'Signaux de vente']);
  if (filters.vendeurs) labels.push(['vendeurs', 'Installés depuis 7 à 10 ans']);
  if (filters.chauds) labels.push(['chauds', 'Intérêt chaud']);
  if (filters.couleurs.length) labels.push(['couleurs', filters.couleurs.map((c) => COLORS[c].label).join(', ')]);
  if (filters.tag) labels.push(['tag', `Étiquette : ${filters.tag}`]);
  bar.innerHTML = labels.map(([k, l]) => `<button type="button" class="chip" data-unf="${k}">${esc(l)} ×</button>`).join('');
  const n = labels.length;
  const fab = $('[data-fab="filter"]');
  if (fab) {
    fab.classList.toggle('on', n > 0);
    fab.querySelector('.fab-badge')?.remove();
    if (n) fab.insertAdjacentHTML('beforeend', `<span class="fab-badge">${n}</span>`);
  }
  // Nombre d'adresses visibles
  if (n) {
    const visible = markers.filter(({ m }) => !m.options.st?.hidden).length;
    bar.insertAdjacentHTML('beforeend', `<span class="chip" style="background:#fff;color:#374151">${plural(visible, 'adresse', 'adresses')}</span>`);
  }
}

async function openFilters() {
  const allTags = new Set();
  for (const u of S.addrUser.values()) for (const t of u.tags || []) allTags.add(t);
  for (const c of S.contacts.values()) if (!c.deletedAt) for (const t of c.tags || []) allTags.add(t);
  const f = { ...filters, couleurs: [...filters.couleurs] };
  const nvOpts = [
    ['', 'Non'],
    ['0', 'Jamais'],
    ['4', '1 mois'],
    ['8', '2 mois'],
    ['13', '3 mois'],
  ];
  const r = await dialog({
    title: 'Afficher seulement',
    cls: 'tall',
    body: `
      <label class="check"><input type="checkbox" data-f="absents" ${f.absents ? 'checked' : ''}/> <span>Absents à repasser</span></label>
      <label class="check"><input type="checkbox" data-f="relances" ${f.relances ? 'checked' : ''}/> <span>Relances du jour (et en retard)</span></label>
      <label class="check"><input type="checkbox" data-f="signaux" ${f.signaux ? 'checked' : ''}/> <span>Signaux de vente</span></label>
      <label class="check"><input type="checkbox" data-f="vendeurs" ${f.vendeurs ? 'checked' : ''}/> <span>Propriétaires installés depuis 7 à 10 ans</span></label>
      <label class="check"><input type="checkbox" data-f="chauds" ${f.chauds ? 'checked' : ''}/> <span>Intérêt chaud</span></label>
      <div class="field-label" style="margin-top:12px">Non visitées depuis</div>
      <div class="seg" data-nv>${nvOpts.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(f.nonVisitees ?? '') === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="field-label" style="margin-top:14px">Couleurs</div>
      <div class="chips" style="padding:0;flex-wrap:wrap" data-cols>${Object.entries(COLORS)
        .map(([k, c]) => `<button type="button" class="chip ${f.couleurs.includes(k) ? 'on' : ''}" data-col="${k}"><span class="dot ${k}"></span>${esc(c.label)}</button>`)
        .join('')}</div>
      ${
        allTags.size
          ? `<label class="field" style="margin-top:14px"><span>Étiquette</span><select data-tag><option value="">Toutes</option>${[...allTags]
              .sort()
              .map((t) => `<option ${t === f.tag ? 'selected' : ''}>${esc(t)}</option>`)
              .join('')}</select></label>`
          : ''
      }`,
    buttons: [
      { label: 'Tout effacer', value: 'clear', kind: 'light' },
      {
        label: 'Appliquer',
        kind: 'primary',
        value: (b) => {
          for (const k of ['absents', 'relances', 'signaux', 'vendeurs', 'chauds']) f[k] = $(`[data-f="${k}"]`, b).checked;
          const nv = $('[data-nv] button.on', b)?.dataset.v ?? '';
          f.nonVisitees = nv === '' ? null : +nv;
          f.couleurs = $$('[data-col].on', b).map((x) => x.dataset.col);
          f.tag = $('[data-tag]', b)?.value || '';
          return f;
        },
      },
    ],
    onOpen(b) {
      $('[data-nv]', b).addEventListener('click', (e) => {
        const x = e.target.closest('button');
        if (!x) return;
        for (const y of $$('[data-nv] button', b)) y.classList.toggle('on', y === x);
      });
      $('[data-cols]', b).addEventListener('click', (e) => {
        const x = e.target.closest('[data-col]');
        if (x) x.classList.toggle('on');
      });
    },
  });
  if (r === 'clear') filters = { absents: false, relances: false, nonVisitees: null, signaux: false, vendeurs: false, chauds: false, couleurs: [], tag: '' };
  else if (r) filters = r;
  else return;
  restyleAll();
  fitToVisible();
}

function fitToVisible() {
  if (!activeFilterCount()) return;
  const pts = markers.filter(({ m }) => !m.options.st?.hidden).map(({ a }) => [a.lat, a.lon]);
  if (!pts.length) return toast('Aucune adresse ne correspond');
  map.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 18 });
}

export function applyFilter(partial) {
  filters = { absents: false, relances: false, nonVisitees: null, signaux: false, vendeurs: false, chauds: false, couleurs: [], tag: '', ...partial };
  restyleAll();
  fitToVisible();
}

async function openLayers() {
  const opts = [
    ['cadastre', 'Cadastre seul', 'Fonctionne sans connexion'],
    ['plan', 'Plan IGN', 'Nécessite le réseau (gardé en mémoire ensuite)'],
    ['photo', 'Photo aérienne', 'Nécessite le réseau (gardée en mémoire ensuite)'],
  ];
  await dialog({
    title: 'Fond de carte',
    body: `<div data-bm>${opts
      .map(([k, l, s]) => `<button type="button" class="layer-opt ${basemap === k ? 'on' : ''}" data-k="${k}"><span class="radio"></span><span><b>${l}</b><br><span class="muted small">${s}</span></span></button>`)
      .join('')}</div>
      <div class="field-label" style="margin-top:16px">Ventes DVF affichées</div>
      <div class="seg" data-years>${[1, 2, 3, 5].map((y) => `<button type="button" data-v="${y}" class="${dvfYears === y ? 'on' : ''}">${y} an${y > 1 ? 's' : ''}</button>`).join('')}</div>
      ${S.dvf ? `<p class="muted small" style="margin-top:8px">Données DVF mises à jour le ${fmtDate(S.dvf.maj)}.</p>` : ''}`,
    buttons: [{ label: 'Fermer', value: true, kind: 'primary' }],
    onOpen(b) {
      $('[data-bm]', b).addEventListener('click', (e) => {
        const x = e.target.closest('[data-k]');
        if (!x) return;
        for (const y of $$('[data-k]', b)) y.classList.toggle('on', y === x);
        setBasemap(x.dataset.k);
      });
      $('[data-years]', b).addEventListener('click', (e) => {
        const x = e.target.closest('[data-v]');
        if (!x) return;
        for (const y of $$('[data-years] button', b)) y.classList.toggle('on', y === x);
        dvfYears = +x.dataset.v;
        setSetting('dvfYears', dvfYears);
        if (showDvf) buildDvf();
      });
    },
  });
}

async function openIlots() {
  const r = await dialog({
    title: 'Aller à un îlot',
    body: `<div class="pick-list" style="margin:0">${S.base.ilots
      .map((il) => {
        const n = [...S.addrs.values()].filter((a) => a.ilot === il.id).length;
        return `<button type="button" class="li" data-il="${il.id}"><span class="li-main"><span class="li-title">${il.id} · ${esc(il.nom)}</span><span class="li-sub">${plural(n, 'adresse', 'adresses')}</span></span>${icon('chevron', 18, 'chev')}</button>`;
      })
      .join('')}<button type="button" class="li" data-il="all"><span class="li-main"><span class="li-title">Vue d’ensemble</span></span></button></div>`,
    buttons: [{ label: 'Fermer', value: null, kind: 'light' }],
    onOpen(b, finish) {
      b.addEventListener('click', (e) => {
        const x = e.target.closest('[data-il]');
        if (x) finish(x.dataset.il);
      });
    },
  });
  if (!r) return;
  if (r === 'all') return fitAll();
  const il = S.ilots.get(+r);
  map.fitBounds(L.latLngBounds(il.ring.map(([x, y]) => [y, x])).pad(0.08));
}

export function fitIlot(id) {
  const il = S.ilots.get(+id);
  if (!il) return;
  nav.goTab('carte');
  setTimeout(() => {
    map.invalidateSize();
    map.fitBounds(L.latLngBounds(il.ring.map(([x, y]) => [y, x])).pad(0.08));
  }, 60);
}

function fitAll() {
  const pts = S.base.ilots.flatMap((il) => il.ring.map(([x, y]) => [y, x]));
  map.fitBounds(L.latLngBounds(pts), { padding: [12, 60] });
}

async function openSearch() {
  await dialog({
    title: 'Rechercher',
    cls: 'tall',
    body: `<div class="searchbar" style="margin:0">${icon('search', 20)}<input type="search" placeholder="Adresse, nom ou téléphone" /></div><div data-res class="pick-list"><p class="muted" style="padding:14px">Ex. : 12 rue du Bel-Air, Dupont, 06 12…</p></div>`,
    buttons: [{ label: 'Fermer', value: null, kind: 'light' }],
    onOpen(b, finish) {
      const input = $('input', b);
      const res = $('[data-res]', b);
      input.addEventListener('input', () => {
        const q = input.value;
        if (q.trim().length < 2) return (res.innerHTML = '');
        const as = searchAddresses(q, 25);
        const cs = searchContacts(q).slice(0, 25);
        res.innerHTML =
          (cs.length
            ? cs
                .map(
                  (c) =>
                    `<button type="button" class="li" data-c="${c.id}"><span class="dot ${contactColor(c)}"></span><span class="li-main"><span class="li-title">${esc(contactDisplay(c))}</span><span class="li-sub">Contact</span></span></button>`,
                )
                .join('')
            : '') +
            as.map((a) => `<button type="button" class="li" data-a="${esc(a.id)}"><span class="dot ${addressColor(a.id)}"></span><span class="li-main"><span class="li-title">${esc(addrLabel(a))}</span><span class="li-sub">${esc(ilotName(a.ilot))}</span></span></button>`).join('') ||
          '<p class="muted" style="padding:14px">Aucun résultat.</p>';
      });
      res.addEventListener('click', (e) => {
        const x = e.target.closest('.li');
        if (!x) return;
        finish(true);
        if (x.dataset.a) focusAddress(x.dataset.a);
        else nav.openContact(x.dataset.c);
      });
      setTimeout(() => input.focus(), 250);
    },
  });
}

function renderLegend() {
  const lg = $('.legend');
  if (!lg) return;
  const mini = getSetting('legendeMini', false);
  lg.classList.toggle('mini', mini);
  lg.innerHTML = mini
    ? 'Légende'
    : `<span><i class="dot vert"></i>Propriétaire</span><span><i class="dot orange"></i>Locataire</span><span><i class="dot bleu sq"></i>Immeuble</span><span><i class="dot rouge"></i>Ne pas démarcher</span><span><i class="dot gris"></i>Inconnu</span><span><i class="dot hollow"></i>Jamais visitée</span>${
        showDvf ? `<span><i class="dot" style="background:#9333ea;border-radius:2px;transform:rotate(45deg)"></i>Vente</span>` : ''
      }`;
}

// ---------- Compteur de portes ----------
export function weekDoors() {
  const t0 = startOfWeek();
  let n = 0;
  for (const p of S.passages.values()) if (p.t >= t0) n++;
  return n;
}
function refreshCounter() {
  const c = $('.counter');
  if (!c) return;
  const n = weekDoors();
  c.innerHTML = `<b>${n}/100</b>portes`;
  c.classList.toggle('done', n >= 100);
}

// ---------- Initialisation ----------
export function initMap(root) {
  root.innerHTML = `
    <div id="map"></div>
    <div class="map-top">
      <button type="button" class="map-search">${icon('search', 20)} Rechercher</button>
      <button type="button" class="counter" title="Portes cette semaine"></button>
    </div>
    <div class="filter-bar"></div>
    <div class="map-fabs">
      <button type="button" class="fab" data-fab="filter" aria-label="Filtres">${icon('filter', 22)}</button>
      <button type="button" class="fab" data-fab="layers" aria-label="Fond de carte">${icon('layers', 22)}</button>
      <button type="button" class="fab" data-fab="dvf" aria-label="Ventes DVF">${icon('euro', 22)}</button>
      <button type="button" class="fab" data-fab="ilots" aria-label="Îlots">${icon('target', 22)}</button>
      <button type="button" class="fab" data-fab="locate" aria-label="Où je suis">${icon('locate', 22)}</button>
    </div>
    <div class="legend"></div>`;
  map = L.map($('#map', root), { zoomControl: false, attributionControl: true, minZoom: 13, maxZoom: 20, preferCanvas: true, zoomSnap: 0.5, zoomDelta: 0.5, tapHold: false });
  map.attributionControl.setPrefix(false);
  map.createPane('basePane').style.zIndex = 350;
  map.createPane('ilotPane').style.zIndex = 380;
  map.createPane('labelPane').style.zIndex = 420;
  map.createPane('addrPane').style.zIndex = 450;
  for (const p of ['basePane', 'ilotPane', 'labelPane', 'addrPane']) map.getPane(p).style.pointerEvents = 'none';
  RB = L.canvas({ pane: 'basePane', padding: 0.4 });
  RI = L.canvas({ pane: 'ilotPane', padding: 0.4 });
  R = L.canvas({ pane: 'addrPane', padding: 0.4, tolerance: 0 });
  buildLayers();
  map.addLayer(layers.ilots);
  map.addLayer(layers.addr);
  map.addLayer(layers.me);
  for (const a of S.addrs.values()) {
    const m = new AddrMarker([a.lat, a.lon], { renderer: R, radius: 5, interactive: false });
    m.options.st = styleFor(a);
    markers.push({ a, m });
    markerById.set(a.id, m);
    m.addTo(layers.addr);
  }
  const saved = getSetting('mapView');
  if (saved) map.setView(saved.c, saved.z);
  else fitAll();
  // La taille définitive de la carte n'est connue qu'après la mise en page.
  requestAnimationFrame(() => {
    map.invalidateSize();
    if (!saved) fitAll();
  });
  basemap = getSetting('basemap', 'cadastre');
  dvfYears = getSetting('dvfYears', 3);
  setBasemap(basemap);
  applyZoomVisibility();
  map.on('zoomend', applyZoomVisibility);
  map.on('moveend', () => setSetting('mapView', { c: [map.getCenter().lat, map.getCenter().lng], z: map.getZoom() }));
  map.on('click', onMapClick);

  root.querySelector('.map-search').addEventListener('click', openSearch);
  root.querySelector('.counter').addEventListener('click', () => nav.goTab('bord'));
  root.querySelector('.map-fabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fab]');
    if (!b) return;
    const k = b.dataset.fab;
    if (k === 'filter') openFilters();
    else if (k === 'layers') openLayers();
    else if (k === 'dvf') toggleDvf(!showDvf);
    else if (k === 'ilots') openIlots();
    else if (k === 'locate') toggleLocate();
  });
  root.querySelector('.filter-bar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unf]');
    if (!b) return;
    const k = b.dataset.unf;
    if (k === 'nonVisitees') filters.nonVisitees = null;
    else if (k === 'couleurs') filters.couleurs = [];
    else if (k === 'tag') filters.tag = '';
    else filters[k] = false;
    restyleAll();
  });
  renderLegend();
  root.querySelector('.legend').addEventListener('click', async () => {
    await setSetting('legendeMini', !getSetting('legendeMini', false));
    renderLegend();
  });
  refreshCounter();
  onChange(() => {
    syncMarkers();
    restyleAll();
    refreshCounter();
  });
  register({ refreshCounter, showOnMap: focusAddress });
  globalThis.__map = map; // utile pour les tests automatisés
  return map;
}

export function mapResized() {
  if (map) setTimeout(() => map.invalidateSize(), 30);
}
export function reloadDvf() {
  if (showDvf) buildDvf();
}
export function currentSelected() {
  return selectedId;
}
export { getSheet };
