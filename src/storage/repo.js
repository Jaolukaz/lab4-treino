/**
 * Repositório de planejamentos. Vários planejamentos ficam salvos no aparelho,
 * cada um com sua foto de atleta e seus escudos enviados.
 *
 * Formato de exportação (.json): compatível com a versão 1 (arquivo HTML único),
 * ou seja, o estado com `athlete.photo` e `crestOverride` em data URL. Assim um arquivo
 * exportado aqui abre na versão 1 e vice-versa.
 */
import { openStore } from './db.js';
import { APP_ID } from '../core/config.js';
import { SCHEMA_VERSION, defaults, hydrate, legacyImages } from '../core/model.js';

const LEGACY_KEY = 'lab4_planejamento_treino_v1';

let store;

export async function initRepo() {
  store = await openStore();
  return store.kind;
}

export const newId = () => globalThis.crypto?.randomUUID?.() || `pl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/* ---------- planejamentos ---------- */
export async function listPlans() {
  const all = await store.getAll('plans');
  return all
    .map((r) => ({
      id: r.id, name: r.state?.athlete?.name || '', category: r.state?.athlete?.category || '',
      sessions: r.state?.sessions?.length || 0, updatedAt: r.updatedAt, createdAt: r.createdAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadPlan(id) {
  const r = await store.get('plans', id);
  return r ? { ...r, state: hydrate(r.state) } : null;
}

export async function savePlan(id, state, createdAt) {
  const now = Date.now();
  await store.put('plans', { id, v: SCHEMA_VERSION, state, createdAt: createdAt || now, updatedAt: now });
  return now;
}

export async function deletePlan(id) {
  await store.del('images', id);
  await store.del('plans', id);
}

export async function createPlan(state = defaults()) {
  const id = newId();
  await savePlan(id, state);
  return { id, state, images: emptyImages() };
}

export async function getCurrentId() { return store.get('meta', 'current'); }
export async function setCurrentId(id) { return store.put('meta', id, 'current'); }
export async function getMeta(key) { return store.get('meta', key); }
export async function setMeta(key, value) { return store.put('meta', value, key); }

/* ---------- imagens ---------- */
/** @typedef {{buf:ArrayBuffer,type:string,w:number,h:number}} ImageRec */
/** @returns {{photo: ImageRec|null, crests: Record<string, ImageRec>}} */
export const emptyImages = () => ({ photo: null, crests: {} });

export async function loadImages(id) {
  const r = await store.get('images', id);
  return r && typeof r === 'object' ? { photo: r.photo || null, crests: r.crests || {} } : emptyImages();
}
export const saveImages = (id, imgs) => store.put('images', { photo: imgs.photo || null, crests: imgs.crests || {} }, id);

/* ---------- conversões ---------- */
async function dataUrlToRec(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  let w = 0;
  let h = 0;
  try {
    const bmp = await createImageBitmap(blob);
    w = bmp.width; h = bmp.height; bmp.close?.();
  } catch { /* dimensões não são essenciais */ }
  return { buf: await blob.arrayBuffer(), type: blob.type || 'image/jpeg', w, h };
}

function recToDataUrl(rec) {
  const bytes = new Uint8Array(rec.buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return `data:${rec.type};base64,${btoa(bin)}`;
}

async function recsFromLegacy(raw) {
  const li = legacyImages(raw);
  const imgs = emptyImages();
  if (li.photo) imgs.photo = await dataUrlToRec(li.photo);
  for (const [k, v] of Object.entries(li.crests)) imgs.crests[k] = await dataUrlToRec(v);
  return imgs;
}

/** Cópia do planejamento em .json, no formato da versão 1 (com metadados extras). */
export function buildExport(state, imgs) {
  const crestOverride = {};
  for (const [k, rec] of Object.entries(imgs.crests || {})) crestOverride[k] = recToDataUrl(rec);
  const out = {
    app: APP_ID, schema: SCHEMA_VERSION, exportadoEm: new Date().toISOString(),
    ...state,
    athlete: { ...state.athlete, photo: imgs.photo ? recToDataUrl(imgs.photo) : '' },
    crestOverride,
  };
  return JSON.stringify(out);
}

/** Importa um arquivo exportado (versão 1 ou 2) como novo planejamento salvo. */
export async function importPlan(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Arquivo inválido: o conteúdo não é um JSON legível.'); }
  if (!data || typeof data !== 'object' || !data.athlete || !Array.isArray(data.sessions)) {
    throw new Error('Este arquivo não é uma cópia de planejamento exportada por esta aplicação.');
  }
  const state = hydrate(data);
  const imgs = await recsFromLegacy(data);
  const id = newId();
  await saveImages(id, imgs);
  await savePlan(id, state);
  return { id, state, images: imgs };
}

/** Recupera o rascunho salvo pela versão 1 (localStorage), quando aberta no mesmo endereço. */
export async function migrateLegacy() {
  let raw;
  try { raw = localStorage.getItem(LEGACY_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const state = hydrate(data);
    const empty = !state.athlete.name && !state.sessions.length && !state.athlete.objective;
    if (!empty) {
      const id = newId();
      await saveImages(id, await recsFromLegacy(data));
      await savePlan(id, state);
      localStorage.removeItem(LEGACY_KEY);
      return id;
    }
    localStorage.removeItem(LEGACY_KEY);
    return null;
  } catch (err) {
    console.warn('[lab4] falha ao migrar rascunho da versão 1', err);
    return null;
  }
}
