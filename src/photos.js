// Photos d'adresse (façade, boîtes aux lettres) : compressées puis gardées sur l'iPhone.
import * as db from './db.js';
import { S, emit } from './state.js';
import { uid, fmtDateTime } from './util.js';
import { html, confirmDialog } from './ui.js';
import { icon } from './icons.js';

const urlCache = new Map();

export function choosePhoto(capture) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve(input.files?.[0] || null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

async function loadImage(file) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* repli ci-dessous */
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export async function compress(file, max = 1600, quality = 0.75) {
  const img = await loadImage(file);
  const w0 = img.width;
  const h0 = img.height;
  const k = Math.min(1, max / Math.max(w0, h0));
  const w = Math.round(w0 * k);
  const h = Math.round(h0 * k);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
  return { blob, w, h };
}

export async function addPhoto(addressId, file) {
  const { blob, w, h } = await compress(file);
  const rec = { id: uid(), addressId, blob, w, h, createdAt: Date.now() };
  await db.put('photos', rec);
  S.photos.set(rec.id, { id: rec.id, addressId, createdAt: rec.createdAt, w, h });
  emit('photos');
  return rec;
}

export async function deletePhoto(id) {
  await db.del('photos', id);
  S.photos.delete(id);
  const u = urlCache.get(id);
  if (u) URL.revokeObjectURL(u);
  urlCache.delete(id);
  emit('photos');
}

export async function photoURL(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const rec = await db.get('photos', id);
  if (!rec?.blob) return '';
  const u = URL.createObjectURL(rec.blob);
  urlCache.set(id, u);
  return u;
}

export const photosOf = (addressId) => [...S.photos.values()].filter((p) => p.addressId === addressId).sort((a, b) => b.createdAt - a.createdAt);

export async function renderPhotoGrid(container, addressId) {
  const list = photosOf(addressId);
  container.innerHTML = list.length ? `<div class="photos">${list.map((p) => `<button type="button" data-ph="${p.id}"><img alt="" /></button>`).join('')}</div>` : '<p class="muted small" style="margin:0">Aucune photo.</p>';
  for (const p of list) {
    const img = container.querySelector(`[data-ph="${p.id}"] img`);
    if (img) img.src = await photoURL(p.id);
  }
}

export async function viewPhoto(id) {
  const meta = S.photos.get(id);
  const el = html(`<div class="photo-view"><div class="pv-bar"><button type="button" data-close>${icon('close', 22)} Fermer</button><span class="small" style="align-self:center">${meta ? fmtDateTime(meta.createdAt) : ''}</span><button type="button" data-del>${icon('trash', 20)} Supprimer</button></div><img alt="Photo" /></div>`);
  el.querySelector('img').src = await photoURL(id);
  document.body.appendChild(el);
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) el.remove();
    else if (e.target.closest('[data-del]')) {
      if (await confirmDialog('Supprimer cette photo ?', { ok: 'Supprimer', danger: true })) {
        await deletePhoto(id);
        el.remove();
      }
    }
  });
}

// Pour la sauvegarde : lecture de toutes les photos avec leur contenu.
export const allPhotoRecords = () => db.getAll('photos');
