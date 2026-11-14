// Outils communs aux tests : serveur local + Chrome sans interface au format iPhone.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

export const PORT = 8765;
export const URL0 = `http://localhost:${PORT}/`;
export const SHOTS = 'tests/shots';
mkdirSync(SHOTS, { recursive: true });

export async function start({ dir = 'dist' } = {}) {
  const srv = spawn('node', ['tests/serve.mjs', dir, String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 400));
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--no-proxy-server', '--lang=fr-FR', '--disable-features=Translate'],
  });
  const page = await browser.newPage();
  await page.emulate({
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });
  await page.emulateTimezone('Europe/Paris');
  const logs = [];
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('response', (r) => {
    if (r.status() === 404) logs.push(`[404] ${r.url()}`);
  });
  page.on('dialog', async (d) => {
    logs.push(`[dialog natif !] ${d.message()}`);
    await d.dismiss();
  });
  const stop = async () => {
    await browser.close();
    srv.kill();
  };
  return { browser, page, logs, stop };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Code d'accès utilisé par les tests.
export const PIN = '258014';

async function waitLockTitle(page, re, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    // La page peut être en train de se recharger : on réessaie.
    const t = await page.evaluate(() => (document.querySelector('#lock:not([hidden]) .lock-title') || {}).textContent || '').catch(() => '');
    if (re.test(t)) return t;
    await sleep(100);
  }
  throw new Error(`Écran du code attendu : ${re}`);
}

// Écran du code au démarrage : création (2 saisies + « J’ai compris ») ou simple déverrouillage.
export async function unlock(page, pin = PIN) {
  const t = await waitLockTitle(page, /Crée ton code|Entre ton code/);
  if (/Crée/.test(t)) {
    await page.keyboard.type(pin);
    await waitLockTitle(page, /Confirme/);
    await page.keyboard.type(pin);
    await waitLockTitle(page, /Retiens/);
    await tapText(page, '#lock .lock-buttons button', 'J’ai compris');
  } else {
    await page.keyboard.type(pin);
  }
  await page.waitForFunction(() => !document.getElementById('boot'), { timeout: 30000 });
  await sleep(300);
}

export async function boot(page, pin = PIN) {
  await page.goto(URL0, { waitUntil: 'networkidle0' });
  await unlock(page, pin);
}

export async function reload(page, waitUntil = 'networkidle0') {
  await page.reload({ waitUntil });
  await unlock(page);
}

export async function shot(page, name) {
  await sleep(350);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

// Clique sur un élément par sélecteur CSS + texte éventuel.
export async function tapText(page, selector, text) {
  const ok = await page.evaluate(
    (sel, txt) => {
      const els = [...document.querySelectorAll(sel)].filter((e) => !txt || e.textContent.replace(/\s+/g, ' ').includes(txt));
      const el = els.reverse().find((e) => e.offsetParent !== null) || els[0];
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      el.click();
      return true;
    },
    selector,
    text || '',
  );
  if (!ok) throw new Error(`Introuvable : ${selector} ${text || ''}`);
  await sleep(300);
}

export async function tapAddress(page, addressId, zoom = 18) {
  const pt = await page.evaluate(
    (id, z) => {
      document.querySelector('.sheet-close')?.click();
      const a = __app.S.addrs.get(id);
      __map.setView([a.lat, a.lon], z, { animate: false });
      __map.panBy([0, Math.round(__map.getSize().y * 0.22)], { animate: false });
      const p = __map.latLngToContainerPoint([a.lat, a.lon]);
      const r = document.getElementById('map').getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    },
    addressId,
    zoom,
  );
  await sleep(400);
  await page.touchscreen.tap(pt.x, pt.y);
  await sleep(500);
  return pt;
}

// Adresses sans voisine à moins de `m` mètres (pour des appuis sans ambiguïté).
export function isolated(page, ilot, n, m = 14) {
  return page.evaluate(
    (il, k, dmin) => {
      const all = [...__app.S.addrs.values()];
      const d = (a, b) => Math.hypot((a.lon - b.lon) * 73300, (a.lat - b.lat) * 110540);
      return all
        .filter((a) => a.ilot === il && all.every((b) => b === a || d(a, b) > dmin))
        .slice(0, k)
        .map((a) => a.id);
    },
    ilot,
    n,
    m,
  );
}
