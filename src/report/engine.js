/**
 * Ponte entre a interface e o motor de relatório.
 * O pdf-lib é carregado sob demanda (import dinâmico), para que o formulário abra rápido
 * mesmo em celulares modestos; o motor fica pronto em segundo plano logo após a abertura.
 * Escudos oficiais são buscados apenas quando o clube aparece no relatório.
 */
import { layoutPlan } from './layout.js';
import { pageToSvg } from './svg.js';
import { brDate, pdfFileName, todayISO, trim } from '../core/model.js';
import b400 from '../assets/fonts/Barlow-400.ttf?url';
import b600 from '../assets/fonts/Barlow-600.ttf?url';
import b700 from '../assets/fonts/Barlow-700.ttf?url';
import c700 from '../assets/fonts/BarlowCondensed-700.ttf?url';
import c800 from '../assets/fonts/BarlowCondensed-800.ttf?url';
import logoBlack from '../assets/logo-black.png?url';
import logoWhite from '../assets/logo-white.png?url';

export const LOGO_URLS = { 'logo-black': logoBlack, 'logo-white': logoWhite };
const FONT_URLS = { b400, b600, b700, c700, c800 };
const crestGlob = import.meta.glob('../assets/crests/*.png', { eager: true, query: '?url', import: 'default' });
/** URL do escudo oficial por chave de clube. */
export const CREST_URLS = Object.fromEntries(Object.entries(crestGlob).map(([p, u]) => [p.split('/').pop().replace('.png', ''), u]));

const bytesOf = async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer());

let enginePromise;
/** Carrega fontes, logos e o módulo de PDF uma única vez. */
export function getEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const [pdf, fontList, logoList] = await Promise.all([
        import('./pdf.js'),
        Promise.all(Object.entries(FONT_URLS).map(async ([k, u]) => [k, await bytesOf(u)])),
        Promise.all(Object.entries(LOGO_URLS).map(async ([k, u]) => [k, { type: 'png', bytes: await bytesOf(u) }])),
      ]);
      const fonts = Object.fromEntries(fontList);
      const measure = await pdf.createMeasurer(fonts);
      return { pdf, fonts, logos: Object.fromEntries(logoList), measure, crests: new Map() };
    })();
    enginePromise.catch(() => { enginePromise = null; });
  }
  return enginePromise;
}

const uploadedFlags = (imgs) => Object.fromEntries(Object.keys(imgs.crests || {}).map((k) => [k, true]));

export async function computeLayout(state, imgs) {
  const e = await getEngine();
  return layoutPlan(state, { measure: e.measure, photo: !!imgs.photo, uploaded: uploadedFlags(imgs), issued: brDate(todayISO()) });
}

export function layoutToSvg(layout, urlFor) {
  return layout.pages.map((pg) => pageToSvg(pg, urlFor, 'pv'));
}

const recType = (rec) => (/png/.test(rec.type) ? 'png' : 'jpg');

/**
 * @param {object} state
 * @param {{photo:object|null, crests:Record<string,object>}} imgs
 * @returns {Promise<{file: File, layout: object}>}
 */
export async function buildPdf(state, imgs) {
  const e = await getEngine();
  const layout = await computeLayout(state, imgs);
  const images = { ...e.logos };
  const refs = new Set(layout.pages.flatMap((p) => p.items.filter((it) => it.t === 'image').map((it) => it.ref)));
  for (const ref of refs) {
    if (images[ref]) continue;
    if (ref === 'photo' && imgs.photo) images.photo = { type: recType(imgs.photo), bytes: new Uint8Array(imgs.photo.buf) };
    else if (ref.startsWith('crest:')) {
      const rec = imgs.crests[ref.slice(6)];
      if (rec) images[ref] = { type: recType(rec), bytes: new Uint8Array(rec.buf) };
    } else if (ref.startsWith('club:')) {
      const k = ref.slice(5);
      if (!e.crests.has(k) && CREST_URLS[k]) e.crests.set(k, await bytesOf(CREST_URLS[k]));
      if (e.crests.has(k)) images[ref] = { type: 'png', bytes: e.crests.get(k) };
    }
  }
  const nome = trim(state.athlete.name);
  const bytes = await e.pdf.renderPdf(layout.pages, {
    fonts: e.fonts,
    images,
    meta: { title: nome ? `Planejamento individual de treino | ${nome}` : 'Planejamento individual de treino', author: trim(state.athlete.coach) || 'Lab-4 Performance' },
  });
  return { file: new File([bytes], pdfFileName(state), { type: 'application/pdf' }), layout };
}
