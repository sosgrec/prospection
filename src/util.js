// Petits outils sans dépendance : identifiants, texte, dates, géométrie.

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// Texte normalisé pour la recherche : minuscules, sans accents, espaces simples.
export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9@.+]+/g, ' ')
    .trim();

export const digits = (s) => String(s ?? '').replace(/\D+/g, '');

// Numéro de téléphone français ramené à 10 chiffres quand c'est possible (+33 6… → 06…).
export function phoneKey(s) {
  let d = digits(s);
  if (d.startsWith('0033')) d = '0' + d.slice(4);
  else if (d.startsWith('33') && d.length === 11) d = '0' + d.slice(2);
  return d;
}

export function formatPhone(s) {
  const d = phoneKey(s);
  if (d.length === 10) return d.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  return String(s ?? '').trim();
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + (f(x) || 0), 0);
export const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

// ---------- Dates (heure locale) ----------
const pad = (n) => String(n).padStart(2, '0');
export const DAY = 86400000;

export function dayStr(d = new Date()) {
  d = d instanceof Date ? d : new Date(d);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const todayStr = () => dayStr(new Date());

export function parseDay(s) {
  // 'AAAA-MM-JJ' → Date locale à minuit
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function localDateTime(ms) {
  const d = new Date(ms);
  return `${dayStr(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseLocalDateTime(s) {
  // Accepte 'AAAA-MM-JJ HH:MM', 'AAAA-MM-JJTHH:MM(:SS)' ou une date seule.
  const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
}

export function startOfDay(ms = Date.now()) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function startOfWeek(ms = Date.now()) {
  // Semaine du lundi au dimanche.
  const d = new Date(startOfDay(ms));
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

export function startOfMonth(ms = Date.now()) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function addMonths(ms, n) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime();
}

export function addDays(ms, n) {
  const d = new Date(ms);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export const daysAgo = (ms) => Math.floor((startOfDay() - startOfDay(ms)) / DAY);

const fDay = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fDayShort = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });
const fLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const fMonth = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const fMonthShort = new Intl.DateTimeFormat('fr-FR', { month: 'short' });

export const fmtDate = (v) => (v == null || v === '' ? '' : fDay.format(typeof v === 'string' ? parseDay(v) : new Date(v)));
export const fmtDayShort = (v) => fDayShort.format(typeof v === 'string' ? parseDay(v) : new Date(v));
export const fmtLong = (v) => fLong.format(typeof v === 'string' ? parseDay(v) : new Date(v));
export const fmtMonth = (ms) => fMonth.format(new Date(ms));
export const fmtMonthShort = (ms) => fMonthShort.format(new Date(ms)).replace('.', '');
export const fmtTime = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}h${pad(d.getMinutes())}`;
};
export const fmtDateTime = (ms) => `${fmtDate(ms)} à ${fmtTime(ms)}`;

export function fmtAgo(ms) {
  const n = daysAgo(ms);
  if (n <= 0) return "aujourd'hui";
  if (n === 1) return 'hier';
  if (n < 30) return `il y a ${n} jours`;
  const m = Math.round(n / 30);
  if (m < 12) return `il y a ${m} mois`;
  const y = Math.floor(n / 365);
  return y <= 1 ? 'il y a plus d’un an' : `il y a ${y} ans`;
}

// Nombres et montants avec des espaces simples (lisibles partout, y compris dans le PDF).
export function fmtNum(n, dec = 0) {
  if (n == null || Number.isNaN(n)) return '';
  const s = Number(n).toFixed(dec);
  const [i, f] = s.split('.');
  const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return f ? `${int},${f}` : int;
}
export const fmtEuro = (n) => (n == null ? '' : `${fmtNum(Math.round(n))} €`);
export const fmtPct = (r) => (r == null || !Number.isFinite(r) ? '' : `${Math.round(r * 100)} %`);

// ---------- Géométrie ([lon, lat]) ----------
export function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(x, y, rings) {
  // Premier anneau = contour, suivants = trous.
  if (!pointInRing(x, y, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) if (pointInRing(x, y, rings[k])) return false;
  return true;
}

export function distM(lon1, lat1, lon2, lat2) {
  const kx = Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180)) * 111320;
  return Math.hypot((lon2 - lon1) * kx, (lat2 - lat1) * 110540);
}

export function bbox(rings) {
  let a = Infinity;
  let b = Infinity;
  let c = -Infinity;
  let d = -Infinity;
  for (const r of rings)
    for (const [x, y] of r) {
      if (x < a) a = x;
      if (y < b) b = y;
      if (x > c) c = x;
      if (y > d) d = y;
    }
  return [a, b, c, d];
}

export function ringAreaM2(ring) {
  const lat0 = ring[0][1];
  const kx = Math.cos(lat0 * (Math.PI / 180)) * 111320;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * kx * ring[i][1] * 110540 - ring[i][0] * kx * ring[j][1] * 110540;
  return Math.abs(a / 2);
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Partage d'un fichier via le menu Partager de l'iPhone, sinon téléchargement classique.
export async function shareOrDownload(blob, filename, title) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'aborted';
    }
  }
  download(blob, filename);
  return 'downloaded';
}
