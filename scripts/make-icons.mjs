// Génère les icônes PNG de l'appli à partir d'un dessin SVG (rendu par Chrome sans interface).
// node scripts/make-icons.mjs          : icônes bleues de la prod, dans public/icons/
// node scripts/make-icons.mjs recette  : icônes orange de la Recette, dans public-recette/icons/
import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'node:fs';

const RECETTE = process.argv[2] === 'recette';
const C = RECETTE
  ? { haut: '#fb923c', bas: '#c2410c', trait: '#c2410c', pastille: '#fde68a' }
  : { haut: '#2563eb', bas: '#1e3a8a', trait: '#1d4ed8', pastille: '#f59e0b' };
const DIR = RECETTE ? 'public-recette/icons' : 'public/icons';

const glyph = `
  <path d="M256 92c-70 0-126 55-126 124 0 92 126 204 126 204s126-112 126-204c0-69-56-124-126-124Z" fill="#fff"/>
  <path d="M256 148l-62 50v66h40v-40h44v40h40v-66l-62-50Z" fill="${C.trait}"/>
  <circle cx="345" cy="352" r="34" fill="#22c55e" stroke="${C.trait}" stroke-width="10"/>
  <circle cx="167" cy="352" r="34" fill="${C.pastille}" stroke="${C.trait}" stroke-width="10"/>`;

const svg = (size, { maskable = false, radius = 112 } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.haut}"/><stop offset="1" stop-color="${C.bas}"/></linearGradient></defs>
  <rect width="512" height="512" rx="${maskable ? 0 : radius}" fill="url(#g)"/>
  <g transform="${maskable ? 'translate(51 51) scale(0.8)' : ''}">${glyph}</g>
</svg>`;

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
mkdirSync(DIR, { recursive: true });
const shots = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-512-maskable.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { maskable: true }],
];
for (const [name, size, opt] of shots) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size, opt)}</body></html>`);
  const buf = await page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  writeFileSync(`${DIR}/${name}`, buf);
}
writeFileSync(`${DIR}/icon.svg`, svg(512));
await browser.close();
console.log('Icônes générées');
