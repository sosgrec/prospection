// Thèmes de couleur de l'appli (barre du haut, boutons, onglet actif, écran du code).
// Le choix est gardé sur le téléphone hors des données chiffrées : il colore aussi l'écran du code.
export const THEMES = [
  { id: 'bleu', label: 'Bleu', head: '#1d4ed8', accent: '#1d4ed8', soft: '#e8eefc', light: '#93c5fd' },
  { id: 'rouge', label: 'Rouge', head: '#c8102e', accent: '#c8102e', soft: '#fde8eb', light: '#ffb3bd' },
  { id: 'bordeaux', label: 'Bordeaux', head: '#7b1e33', accent: '#8f2440', soft: '#f6e7eb', light: '#f4b9c7' },
  { id: 'framboise', label: 'Framboise', head: '#b0154f', accent: '#c2185b', soft: '#fce6ef', light: '#ffb0cd' },
  { id: 'graphite', label: 'Graphite', head: '#25282d', accent: '#2f343b', soft: '#eceef1', light: '#c9ced6' },
];
const KEY = 'prospection-theme';
// Couleur de la bande de l'heure quand iOS la dessine au-dessus de l'appli (installation d'avant le plein écran).
export const STATUS_NEUTRE = '#1d2024';
let statusTheme = false;

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
export const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};

export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
export const currentTheme = () => themeById(document.documentElement.dataset.theme);

export function applyTheme(id) {
  const t = themeById(id);
  const vars = { '--head': t.head, '--accent': t.accent, '--accent-soft': t.soft, '--accent-light': t.light, '--accent-ring': rgba(t.accent, 0.35) };
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.theme = t.id;
  setStatusBar(statusTheme);
  // Relu au démarrage par index.html, avant même le chargement de l'appli (pas de flash de couleur).
  try {
    localStorage.setItem(KEY, JSON.stringify({ id: t.id, vars }));
  } catch {
    /* stockage indisponible : le thème reste valable jusqu'à la fermeture */
  }
  return t;
}

// Bande de l'heure : neutre sur la carte, couleur du thème sous une barre du haut colorée.
export function setStatusBar(useTheme) {
  statusTheme = !!useTheme;
  const color = statusTheme ? themeById(document.documentElement.dataset.theme).head : STATUS_NEUTRE;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}

export function savedThemeId() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null')?.id || null;
  } catch {
    return null;
  }
}
