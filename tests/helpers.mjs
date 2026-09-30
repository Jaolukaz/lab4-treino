import { readFile } from 'node:fs/promises';
import { createMeasurer, FONT_KEYS } from '../src/report/pdf.js';
import { CLUBS } from '../src/core/config.js';

const FONT_FILES = { b400: 'Barlow-400', b600: 'Barlow-600', b700: 'Barlow-700', c700: 'BarlowCondensed-700', c800: 'BarlowCondensed-800' };
const rel = (p) => new URL(p, import.meta.url);

/** Carrega fontes, logos, escudos oficiais e (opcional) uma foto de atleta, como o navegador faria. */
export async function loadAssets({ photo = false } = {}) {
  const fonts = {};
  for (const k of FONT_KEYS) fonts[k] = await readFile(rel(`../src/assets/fonts/${FONT_FILES[k]}.ttf`));
  const images = {
    'logo-black': { type: 'png', bytes: await readFile(rel('../src/assets/logo-black.png')) },
    'logo-white': { type: 'png', bytes: await readFile(rel('../src/assets/logo-white.png')) },
  };
  for (const [k, c] of Object.entries(CLUBS)) if (c.crest === 'png') images[`club:${k}`] = { type: 'png', bytes: await readFile(rel(`../src/assets/crests/${k}.png`)) };
  if (photo) images.photo = { type: 'jpg', bytes: await readFile(rel('fixtures/retrato.jpg')) };
  return { fonts, images, measure: await createMeasurer(fonts) };
}
