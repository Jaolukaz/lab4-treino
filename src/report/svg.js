/**
 * Renderizador SVG da lista de desenho, usado na pré-visualização A4.
 * Usa exatamente as mesmas coordenadas e quebras de linha do PDF.
 */
import { PT } from './text.js';
import { roundRectPath } from './layout.js';

const FONT = {
  b400: ['Barlow', 400], b600: ['Barlow', 600], b700: ['Barlow', 700],
  c700: ['Barlow Condensed', 700], c800: ['Barlow Condensed', 800],
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const n = (v) => +v.toFixed(3);
const paint = (it) => `fill="${it.fill || 'none'}"${it.stroke ? ` stroke="${it.stroke}" stroke-width="${n(it.sw || 0.3)}"` : ''}${it.dash ? ` stroke-dasharray="${it.dash.map(n).join(' ')}"` : ''}${it.cap ? ` stroke-linecap="${it.cap}"` : ''}`;

/**
 * @param {{n:number, items:Array, overflow:boolean}} pg
 * @param {(ref:string)=>string|null} urlFor URL de exibição para logos, escudos e foto
 * @param {string} uid prefixo único para ids de recorte (várias páginas no mesmo documento)
 */
export function pageToSvg(pg, urlFor, uid = 'p') {
  const out = [];
  const defs = [];
  pg.items.forEach((it, idx) => {
    switch (it.t) {
      case 'rect':
        if (Array.isArray(it.r)) out.push(`<path d="${roundRectPath(it.x, it.y, it.w, it.h, it.r)}" ${paint(it)}/>`);
        else out.push(`<rect x="${n(it.x)}" y="${n(it.y)}" width="${n(it.w)}" height="${n(it.h)}"${it.r ? ` rx="${n(it.r)}"` : ''} ${paint(it)}/>`);
        break;
      case 'circle':
        out.push(`<circle cx="${n(it.cx)}" cy="${n(it.cy)}" r="${n(it.r)}" ${paint(it)}/>`);
        break;
      case 'path':
        out.push(`<path d="${it.d}" ${paint(it)}/>`);
        break;
      case 'text': {
        const [fam, wt] = FONT[it.f];
        const size = it.size * PT;
        const anchor = it.anchor === 'start' ? '' : ` text-anchor="${it.anchor}"`;
        const ls = it.ls ? ` letter-spacing="${n(it.ls * size)}"` : '';
        out.push(`<text x="${n(it.x)}" y="${n(it.y)}" font-family="${fam}" font-weight="${wt}" font-size="${n(size)}" fill="${it.color}"${anchor}${ls}>${esc(it.s)}</text>`);
        break;
      }
      case 'image': {
        const url = urlFor(it.ref);
        if (!url) break;
        const par = it.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet';
        let cp = '';
        if (it.clip === 'circle') {
          const id = `${uid}-${pg.n}-${idx}`;
          defs.push(`<clipPath id="${id}"><circle cx="${n(it.x + it.w / 2)}" cy="${n(it.y + it.h / 2)}" r="${n(Math.min(it.w, it.h) / 2)}"/></clipPath>`);
          cp = ` clip-path="url(#${id})"`;
        }
        out.push(`<image href="${esc(url)}" x="${n(it.x)}" y="${n(it.y)}" width="${n(it.w)}" height="${n(it.h)}" preserveAspectRatio="${par}"${cp}/>`);
        break;
      }
      default:
        break;
    }
  });
  return `<svg class="pg-svg${pg.overflow ? ' overflow' : ''}" viewBox="0 0 210 297" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Página ${pg.n}">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}<rect width="210" height="297" fill="#fff"/>${out.join('')}</svg>`;
}
