/**
 * Cores do clube: contraste, misturas e a paleta derivada usada pela interface e pelo relatório.
 * Mesma regra da versão web: a cor secundária só vira cor de texto sobre a faixa se tiver
 * contraste suficiente; o tom "ink" é a primária escurecida até ser legível sobre branco.
 */
export function hexNorm(h) {
  let x = String(h || '').trim();
  if (/^#[0-9a-f]{3}$/i.test(x)) x = `#${x.slice(1).split('').map((c) => c + c).join('')}`;
  return /^#[0-9a-f]{6}$/i.test(x) ? x.toUpperCase() : '#000000';
}
const rgb = (h) => [1, 3, 5].map((i) => parseInt(hexNorm(h).slice(i, i + 2), 16));
const toHex = (a) => `#${a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
export const mix = (a, b, t) => { const A = rgb(a); const B = rgb(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
export function lum(h) {
  return rgb(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
}
export function contrast(a, b) {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Cor legível sobre um fundo: a preferida, se tiver contraste mínimo; senão branco ou preto. */
export function onColor(bg, preferred) {
  if (preferred && contrast(preferred, bg) >= 3.2) return hexNorm(preferred);
  return contrast('#FFFFFF', bg) >= contrast('#000000', bg) ? '#FFFFFF' : '#000000';
}

/**
 * @param {{primary:string, secondary:string, accent:string}} club
 * @returns {{c1,c2,on1,c1ink,c1t,c1t2,c1l,stripe,lightOn:boolean}}
 */
export function themeOf(club) {
  const p = hexNorm(club.primary);
  const sec = hexNorm(club.secondary);
  const on1 = onColor(p, sec);
  let ink = p;
  for (let i = 0; i < 20 && contrast(ink, '#FFFFFF') < 4.6; i += 1) ink = mix(ink, '#000000', 0.12);
  const whiteish = (c) => contrast(c, '#FFFFFF') < 1.25;
  let stripe = [club.accent, sec].map(hexNorm).find((c) => !whiteish(c) && contrast(c, p) >= 1.8);
  if (!stripe) stripe = lum(p) < 0.03 ? '#9A9A9A' : mix(p, '#000000', 0.38);
  return {
    c1: p, c2: sec, on1, c1ink: ink,
    c1t: mix(p, '#FFFFFF', 0.93), c1t2: mix(p, '#FFFFFF', 0.82), c1l: mix(p, '#FFFFFF', 0.58),
    stripe, lightOn: lum(on1) > 0.5,
  };
}
