/**
 * Renderizador PDF vetorial.
 * Converte a lista de desenho do motor de layout em um PDF A4 com texto real (selecionável),
 * fontes Barlow embutidas em subconjunto e imagens embutidas sem recompressão.
 * Funciona no navegador e em Node (usado nos testes automatizados).
 * Base: renderizador da Avaliação Funcional v2, com recorte circular, cantos por lado e tracejado.
 */
import {
  PDFDocument, LineCapStyle, rgb, pushGraphicsState, popGraphicsState, setCharacterSpacing,
  moveTo, lineTo, appendBezierCurve, closePath, clip, endPath,
  drawSvgPath as svgPathOperators, concatTransformationMatrix, drawObject,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { MM_TO_PT } from './text.js';
import { roundRectPath } from './layout.js';

export const A4_PT = [595.2756, 841.8898];
export const FONT_KEYS = ['b400', 'b600', 'b700', 'c700', 'c800'];

const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/**
 * Cria um medidor de texto a partir dos bytes das fontes. O mesmo medidor é usado pelo
 * layout no navegador e nos testes, garantindo quebras de linha idênticas em todos os aparelhos.
 * @returns {Promise<(s:string,f:string,size:number,ls?:number)=>number>} largura em mm
 */
export async function createMeasurer(fontBytes) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = {};
  for (const k of FONT_KEYS) fonts[k] = await doc.embedFont(fontBytes[k], { subset: false });
  const cache = new Map();
  return (s, f, size, ls = 0) => {
    const key = `${f}|${s}`;
    let w1 = cache.get(key);
    if (w1 === undefined) {
      w1 = fonts[f].widthOfTextAtSize(s, 1);
      if (cache.size > 8000) cache.clear();
      cache.set(key, w1);
    }
    const chars = [...s].length;
    return (w1 * size + (chars > 1 ? ls * size * (chars - 1) : 0)) / MM_TO_PT;
  };
}

/**
 * @param {Array<{n:number, items:Array}>} pages lista de desenho
 * @param {{fonts:object, images:Record<string,{bytes:Uint8Array|ArrayBuffer,type:'png'|'jpg'}>, meta?:object}} assets
 * @returns {Promise<Uint8Array>}
 */
export async function renderPdf(pages, assets) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const meta = assets.meta || {};
  doc.setTitle(meta.title || 'Planejamento individual de treino', { showInWindowTitleBar: true });
  doc.setAuthor(meta.author || 'Lab-4 Performance');
  doc.setSubject('Planejamento individual de treino');
  doc.setCreator('Lab-4 Planejamento de Treino');
  doc.setProducer('Lab-4 Planejamento de Treino (pdf-lib)');
  doc.setLanguage('pt-BR');
  doc.setCreationDate(meta.date || new Date());

  const fonts = {};
  for (const k of FONT_KEYS) fonts[k] = await doc.embedFont(assets.fonts[k], { subset: true });

  const embedded = new Map();
  const getImage = async (ref) => {
    if (embedded.has(ref)) return embedded.get(ref);
    const src = assets.images[ref];
    let img = null;
    if (src) {
      try { img = src.type === 'png' ? await doc.embedPng(src.bytes) : await doc.embedJpg(src.bytes); } catch (err) { console.warn('[lab4] imagem ignorada no PDF', ref, err); }
    }
    embedded.set(ref, img);
    return img;
  };

  const [W, H] = A4_PT;
  const P = (mm) => mm * MM_TO_PT;
  const svgOpts = (it) => ({
    x: 0, y: H, scale: MM_TO_PT,
    color: it.fill ? hex(it.fill) : undefined,
    borderColor: it.stroke ? hex(it.stroke) : undefined,
    borderWidth: it.stroke ? it.sw || 0.3 : undefined,
    borderDashArray: it.dash || undefined,
    borderLineCap: it.cap === 'round' ? LineCapStyle.Round : undefined,
  });
  // círculo por 4 curvas de Bézier (k = 0,5523), para recorte
  const circleOps = (cx, cy, r) => {
    const k = 0.5523 * r;
    return [
      moveTo(cx + r, cy),
      appendBezierCurve(cx + r, cy + k, cx + k, cy + r, cx, cy + r),
      appendBezierCurve(cx - k, cy + r, cx - r, cy + k, cx - r, cy),
      appendBezierCurve(cx - r, cy - k, cx - k, cy - r, cx, cy - r),
      appendBezierCurve(cx + k, cy - r, cx + r, cy - k, cx + r, cy),
      closePath(),
    ];
  };

  /*
   * Desenhos vetoriais repetidos (o logo aparece em todas as páginas) viram um Form XObject:
   * o traçado é gravado uma única vez, comprimido, e cada página apenas o referencia.
   * Sem isso, o mesmo caminho seria repetido sem compressão a cada ocorrência.
   */
  const forms = new Map();
  const vectorForm = (d, fill) => {
    const key = `${fill}|${d}`;
    let ref = forms.get(key);
    if (!ref) {
      const ops = svgPathOperators(d, { x: 0, y: 1000, scale: 1, color: hex(fill) });
      const stream = doc.context.flateStream(ops.map((op) => op.toString()).join('\n'), {
        Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 1000, 1000],
      });
      ref = doc.context.register(stream);
      forms.set(key, ref);
    }
    return ref;
  };

  for (const pg of pages) {
    const page = doc.addPage([W, H]);
    for (const it of pg.items) {
      if (it.screen) continue; // itens apenas de tela (avisos da pré-visualização)
      switch (it.t) {
        case 'rect': {
          if (it.r || it.dash) {
            page.drawSvgPath(roundRectPath(it.x, it.y, it.w, it.h, it.r || 0), svgOpts(it));
          } else {
            const opts = { x: P(it.x), y: H - P(it.y + it.h), width: P(it.w), height: P(it.h) };
            if (it.fill) opts.color = hex(it.fill);
            if (it.stroke) { opts.borderColor = hex(it.stroke); opts.borderWidth = P(it.sw || 0.3); }
            page.drawRectangle(opts);
          }
          break;
        }
        case 'circle':
          page.drawCircle({
            x: P(it.cx), y: H - P(it.cy), size: P(it.r),
            color: it.fill ? hex(it.fill) : undefined,
            borderColor: it.stroke ? hex(it.stroke) : undefined,
            borderWidth: it.stroke ? P(it.sw) : undefined,
          });
          break;
        case 'path':
          page.drawSvgPath(it.d, svgOpts(it));
          break;
        case 'vector': {
          const name = page.node.newXObject('Vec', vectorForm(it.d, it.fill));
          const k = P(it.s); // pontos por unidade da caixa de 1000
          page.pushOperators(pushGraphicsState(), concatTransformationMatrix(k, 0, 0, k, P(it.x), H - P(it.y) - 1000 * k), drawObject(name), popGraphicsState());
          break;
        }
        case 'text': {
          const font = fonts[it.f];
          const chars = [...it.s].length;
          const w = font.widthOfTextAtSize(it.s, it.size) + (it.ls && chars > 1 ? it.ls * it.size * (chars - 1) : 0);
          let x = P(it.x);
          if (it.anchor === 'end') x -= w;
          else if (it.anchor === 'middle') x -= w / 2;
          if (it.ls) page.pushOperators(pushGraphicsState(), setCharacterSpacing(it.ls * it.size));
          page.drawText(it.s, { x, y: H - P(it.y), size: it.size, font, color: hex(it.color) });
          if (it.ls) page.pushOperators(popGraphicsState());
          break;
        }
        case 'image': {
          const img = await getImage(it.ref);
          if (!img) break;
          const s = it.fit === 'cover' ? Math.max(it.w / img.width, it.h / img.height) : Math.min(it.w / img.width, it.h / img.height);
          const dw = img.width * s;
          const dh = img.height * s;
          const dx = it.x + (it.w - dw) / 2;
          const dy = it.y + (it.h - dh) / 2;
          const clipped = it.fit === 'cover' || it.clip === 'circle';
          if (clipped) {
            const ops = it.clip === 'circle'
              ? circleOps(P(it.x + it.w / 2), H - P(it.y + it.h / 2), P(Math.min(it.w, it.h) / 2))
              : [moveTo(P(it.x), H - P(it.y)), lineTo(P(it.x + it.w), H - P(it.y)), lineTo(P(it.x + it.w), H - P(it.y + it.h)), lineTo(P(it.x), H - P(it.y + it.h)), closePath()];
            page.pushOperators(pushGraphicsState(), ...ops, clip(), endPath());
          }
          page.drawImage(img, { x: P(dx), y: H - P(dy + dh), width: P(dw), height: P(dh) });
          if (clipped) page.pushOperators(popGraphicsState());
          break;
        }
        default:
          break;
      }
    }
  }
  return doc.save({ useObjectStreams: true });
}
