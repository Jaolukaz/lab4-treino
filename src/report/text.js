/**
 * Utilitários tipográficos do motor de layout.
 * Unidades: geometria em milímetros, corpo de fonte em pontos tipográficos.
 */
export const PT = 25.4 / 72; // mm por ponto
export const MM_TO_PT = 72 / 25.4;

/** Altura de linha em mm para um corpo (pt) e um fator de entrelinha. */
export const lh = (size, factor = 1.35) => size * PT * factor;

/**
 * Linha de base de um texto centralizado verticalmente numa caixa de linha.
 * A Barlow tem altura de versal de 0,7 em; centralizar as versais dá o equilíbrio óptico
 * mais próximo do que o navegador fazia na versão HTML.
 */
export const baseline = (top, size, factor = 1.35) => top + lh(size, factor) / 2 + 0.35 * size * PT;

/** Normaliza espaços para que PDF e SVG exibam exatamente o mesmo texto. */
export const clean = (s) => String(s ?? '').replace(/[ \t\u00A0]+/g, ' ').trim();

/**
 * Quebra um texto em linhas que caibam em maxW (mm), respeitando quebras de parágrafo.
 * Palavras maiores que a largura são partidas por caractere.
 * @param {(s:string,f:string,size:number,ls?:number)=>number} measure largura em mm
 */
export function wrap(measure, text, font, size, maxW, ls = 0) {
  const out = [];
  const paras = String(text ?? '').replace(/\r/g, '').split('\n');
  for (const para of paras) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (let w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (measure(cand, font, size, ls) <= maxW) {
        line = cand;
        continue;
      }
      if (line) out.push(line);
      line = '';
      while (measure(w, font, size, ls) > maxW && w.length > 1) {
        let i = w.length - 1;
        while (i > 1 && measure(w.slice(0, i), font, size, ls) > maxW) i -= 1;
        out.push(w.slice(0, i));
        w = w.slice(i);
      }
      line = w;
    }
    out.push(line);
  }
  while (out.length > 1 && out[out.length - 1] === '') out.pop();
  while (out.length > 1 && out[0] === '') out.shift();
  return out;
}

/** Corta um texto com reticências para caber numa largura. */
export function ellipsize(measure, text, font, size, maxW, ls = 0) {
  const s = clean(text);
  if (measure(s, font, size, ls) <= maxW) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(`${s.slice(0, mid).trimEnd()}…`, font, size, ls) <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return `${s.slice(0, lo).trimEnd()}…`;
}
