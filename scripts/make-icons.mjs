// Génère les icônes PNG de l'appli à partir d'un dessin SVG (rendu par Chrome sans interface).
import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'node:fs';

const glyph = `
  <path d="M256 92c-70 0-126 55-126 124 0 92 126 204 126 204s126-112 126-204c0-69-56-124-126-124Z" fill="#fff"/>
  <path d="M256 148l-62 50v66h40v-40h44v40h40v-66l-62-50Z" fill="#1d4ed8"/>
  <circle cx="345" cy="352" r="34" fill="#22c55e" stroke="#1d4ed8" stroke-width="10"/>
  <circle cx="167" cy="352" r="34" fill="#f59e0b" stroke="#1d4ed8" stroke-width="10"/>`;

const svg = (size, { maskable = false, radius = 112 } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#1e3a8a"/></linearGradient></defs>
  <rect width="512" height="512" rx="${maskable ? 0 : radius}" fill="url(#g)"/>
  <g transform="${maskable ? 'translate(51 51) scale(0.8)' : ''}">${glyph}</g>
</svg>`;

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
mkdirSync('public/icons', { recursive: true });
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
  writeFileSync(`public/icons/${name}`, buf);
}
writeFileSync('public/icons/icon.svg', svg(512));
await browser.close();
console.log('Icônes générées');
