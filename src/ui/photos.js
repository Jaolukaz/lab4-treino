/**
 * Processamento de imagens no próprio aparelho.
 * As imagens são decodificadas uma de cada vez (fila) para evitar picos de memória
 * com câmeras de alta resolução. A foto do atleta é recortada em quadrado (JPEG);
 * o escudo enviado mantém a proporção e a transparência (PNG).
 */
import { CREST_MAX, PHOTO_JPEG_QUALITY, PHOTO_SIZE } from '../core/config.js';

let queue = Promise.resolve();

async function decode(file) {
  if ('createImageBitmap' in globalThis) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* recurso parcial: tenta <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await (img.decode ? img.decode() : new Promise((res, rej) => { img.onload = res; img.onerror = rej; }));
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

async function toRec(canvas, type, quality) {
  const blob = await new Promise((res) => canvas.toBlob(res, type, quality));
  const { width: w, height: h } = canvas;
  canvas.width = 0; // libera a memória do canvas (relevante no iOS)
  canvas.height = 0;
  if (!blob) throw new Error('Falha ao comprimir a imagem');
  return { buf: await blob.arrayBuffer(), type, w, h };
}

async function squarePhoto(file) {
  const src = await decode(file);
  const w0 = src.naturalWidth || src.width;
  const h0 = src.naturalHeight || src.height;
  if (!w0 || !h0) throw new Error('Imagem sem dimensões');
  const side = Math.min(w0, h0);
  const S = Math.min(PHOTO_SIZE, side);
  const sx = (w0 - side) / 2;
  const sy = Math.max(0, (h0 - side) * 0.3); // recorte levemente acima do centro (rosto)
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, S, S);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, side, side, 0, 0, S, S);
  src.close?.();
  return toRec(canvas, 'image/jpeg', PHOTO_JPEG_QUALITY);
}

async function crestImage(file) {
  const src = await decode(file);
  const w0 = src.naturalWidth || src.width;
  const h0 = src.naturalHeight || src.height;
  if (!w0 || !h0) throw new Error('Imagem sem dimensões');
  const s = Math.min(1, CREST_MAX / Math.max(w0, h0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w0 * s);
  canvas.height = Math.round(h0 * s);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  src.close?.();
  return toRec(canvas, 'image/png');
}

const enqueue = (fn) => { const job = queue.then(fn); queue = job.catch(() => {}); return job; };
/** @returns {Promise<{buf:ArrayBuffer,type:string,w:number,h:number}>} */
export const processPhoto = (file) => enqueue(() => squarePhoto(file));
export const processCrest = (file) => enqueue(() => crestImage(file));

/** Mantém object URLs para exibição (foto e escudos enviados), liberando os antigos. */
export class ImageUrls {
  constructor() { this.urls = {}; }
  set(key, rec) {
    this.revoke(key);
    if (rec) this.urls[key] = URL.createObjectURL(new Blob([rec.buf], { type: rec.type }));
  }
  get(key) { return this.urls[key] || null; }
  revoke(key) { if (this.urls[key]) URL.revokeObjectURL(this.urls[key]); delete this.urls[key]; }
  reset(imgs) {
    Object.keys(this.urls).forEach((k) => this.revoke(k));
    if (imgs.photo) this.set('photo', imgs.photo);
    Object.entries(imgs.crests || {}).forEach(([k, r]) => this.set(`crest:${k}`, r));
  }
}
