/**
 * Motor de layout do relatório A4 do Planejamento Individual de Treino.
 *
 * Recebe o estado do planejamento e devolve, para cada página, uma "lista de desenho":
 * retângulos, textos, imagens e caminhos em milímetros (origem no canto superior esquerdo).
 * A mesma lista é desenhada em SVG (pré-visualização) e em PDF vetorial, então a tela
 * e o arquivo final são idênticos por construção, em qualquer aparelho.
 *
 * O desenho reproduz o relatório da versão web (páginas de 794 × 1123 px): as medidas
 * foram convertidas com px(v) = v × 25,4 / 96 mm e os corpos de fonte com fp(v) = v × 0,75 pt.
 *
 * Paginação: cada bloco é medido antes de ser desenhado. Um cartão de sessão nunca é
 * partido se couber inteiro numa página; se for maior que uma página inteira, é dividido
 * entre dois exercícios (nunca no meio de um), com cabeçalho de continuação.
 *
 * O módulo é puro (sem DOM). A medição de texto é injetada, o que permite rodar
 * os mesmos cálculos no navegador e nos testes em Node.
 */
import { MON, MON_FULL, WD, WD_FULL } from '../core/config.js';
import { brDate, clubInfo, initials, pad2, parseISO, periodOf, sortedSessions, trim } from '../core/model.js';
import { mix, onColor, themeOf } from '../core/theme.js';
import { baseline, clean, ellipsize, lh, wrap } from './text.js';
import { LAB4_LOGO_D } from './vectors.js';

export const px = (v) => (v * 25.4) / 96;
const fp = (v) => v * 0.75;

export const PAGE = {
  w: 210, h: 297,
  x0: px(40), cw: 210 - 2 * px(40),
  coverH: px(262), runH: px(62), footH: px(42),
};
PAGE.right = PAGE.x0 + PAGE.cw;
PAGE.footTop = PAGE.h - PAGE.footH;
PAGE.top1 = PAGE.coverH + px(20);
PAGE.top = PAGE.runH + px(18);
PAGE.bottom = PAGE.footTop - px(14);
const GAP = px(14);

export const C = {
  white: '#FFFFFF', ink: '#202020', muted: '#696966', line: '#D7D7D2', band: '#F3F3F0',
  ph: '#9A9A96', faint: '#B3B3AE', phBox: '#B0B0AB',
  ctxBg: '#FFF4D6', ctxInk: '#6E4A00', ctxLine: '#E9C56B',
};

const UP = (s) => clean(s).toLocaleUpperCase('pt-BR');

/* ---------------- geometria auxiliar ---------------- */
const f3 = (v) => +v.toFixed(3);
/** Caminho de retângulo com raio por canto [sup. esq., sup. dir., inf. dir., inf. esq.]. */
export function roundRectPath(x, y, w, h, r) {
  const [a, b, c, d] = (Array.isArray(r) ? r : [r, r, r, r]).map((v) => Math.min(v || 0, w / 2, h / 2));
  const arc = (rr, ex, ey) => (rr ? `A${f3(rr)} ${f3(rr)} 0 0 1 ${f3(ex)} ${f3(ey)}` : `L${f3(ex)} ${f3(ey)}`);
  return `M${f3(x + a)} ${f3(y)}H${f3(x + w - b)}${arc(b, x + w, y + b)}V${f3(y + h - c)}${arc(c, x + w - c, y + h)}`
    + `H${f3(x + d)}${arc(d, x, y + h - d)}V${f3(y + a)}${arc(a, x + a, y)}Z`;
}

class Sheet {
  constructor(n) {
    this.n = n;
    this.items = [];
    this.overflow = false;
  }
  add(it) { this.items.push(this.screen ? { ...it, screen: true } : it); }
  rect(x, y, w, h, fill, extra = {}) { this.add({ t: 'rect', x, y, w, h, fill, ...extra }); }
  hline(x, y, w, color, sw = px(1)) { this.rect(x, y, w, sw, color); }
  vline(x, y, h, color, sw = px(1)) { this.rect(x, y, sw, h, color); }
  text(x, y, s, f, size, color, extra = {}) { if (s !== '') this.add({ t: 'text', x, y, s, f, size, color, anchor: 'start', ls: 0, ...extra }); }
  image(ref, x, y, w, h, fit = 'contain', extra = {}) { this.add({ t: 'image', ref, x, y, w, h, fit, align: 'center', ...extra }); }
  path(d, extra) { this.add({ t: 'path', d, ...extra }); }
  circle(cx, cy, r, fill, extra = {}) { this.add({ t: 'circle', cx, cy, r, fill, ...extra }); }
  /** Desenho vetorial em caixa de 1000 unidades (ex.: logo), posicionado em (x, y) com lado `size` mm. */
  vector(d, x, y, size, fill) { this.add({ t: 'vector', d, x, y, s: size / 1000, fill }); }
  /** Logo da Lab-4 em vetor: nítido em qualquer zoom. */
  logo(x, y, size, fill) { this.vector(LAB4_LOGO_D, x, y, size, fill); }
}

/**
 * @param {object} s estado do planejamento
 * @param {{measure:Function, photo?:boolean, uploaded?:Record<string,boolean>, issued?:string}} ctx
 *   photo: há foto do atleta; uploaded: escudos enviados por chave de clube; issued: data de emissão (dd/mm/aaaa)
 * @returns {{pages:Array, overflowPages:number[], club:object, theme:object}}
 */
export function layoutPlan(s, ctx) {
  return new Layout(s, ctx).run();
}

class Layout {
  constructor(s, ctx) {
    this.s = s;
    this.m = ctx.measure;
    this.hasPhoto = !!ctx.photo;
    this.club = clubInfo(s, ctx.uploaded || {});
    this.T = themeOf(this.club);
    this.issued = ctx.issued || brDate(new Date().toISOString().slice(0, 10));
    this.list = sortedSessions(s.sessions);
  }

  /* ================= execução e paginação ================= */
  run() {
    const pages = [];
    let pg;
    let y;
    const newPage = () => {
      pg = new Sheet(pages.length + 1);
      pages.push(pg);
      if (pg.n === 1) this.cover(pg); else this.runHead(pg);
      y = pg.n === 1 ? PAGE.top1 : PAGE.top;
    };
    const top = () => (pg.n === 1 ? PAGE.top1 : PAGE.top);
    const empty = () => y <= top() + 0.001;
    const fits = (h) => y + h <= PAGE.bottom + 0.01;
    const put = (blk) => {
      blk.draw(pg, y);
      if (y + blk.h > PAGE.bottom + 0.05) pg.overflow = true;
      y += blk.h + GAP;
    };
    const place = (blk) => {
      if (!blk) return;
      if (!fits(blk.h) && !empty()) newPage();
      put(blk);
    };

    newPage();
    place(this.metaBlock());
    place(this.objectiveBlock());
    place(this.timelineBlock());
    if (!this.list.length) place(this.placeholderBlock());

    const total = this.list.length;
    this.list.forEach((s, idx) => {
      const card = this.cardModel(s, idx + 1, total);
      const n = s.exercises.length;
      const full = card.piece(0, n, false);
      if (fits(full.h)) { put(full); return; }
      if (!empty()) {
        newPage();
        if (fits(full.h)) { put(full); return; }
      }
      // cartão maior que uma página inteira: divide entre exercícios
      let i = 0;
      let cont = false;
      for (let guard = 0; guard < 500; guard += 1) {
        let k = i;
        while (k < n && fits(card.piece(i, k + 1, cont).h)) k += 1;
        if (k === i && i < n) {
          if (!empty()) { newPage(); continue; }
          k = i + 1; // um único exercício maior que a página: desenha e sinaliza excesso
        }
        put(card.piece(i, k, cont));
        if (k >= n) break;
        newPage();
        cont = true;
        i = k;
      }
    });

    pages.forEach((p) => this.footer(p, pages.length));
    return { pages, overflowPages: pages.filter((p) => p.overflow).map((p) => p.n), club: this.club, theme: this.T };
  }

  /* ================= moldura ================= */
  cover(pg) {
    const { T } = this;
    const { x0, right, coverH } = PAGE;
    const a = this.s.athlete;
    pg.rect(0, 0, PAGE.w, coverH, T.c1);
    pg.rect(0, coverH - px(8), PAGE.w, px(8), T.stripe);

    const cTop = px(32);
    const cBot = coverH - px(34);
    const cy = (cTop + cBot) / 2;

    // foto circular com anel na cor de contraste
    const D = px(172);
    const pcx = x0 + D / 2;
    pg.circle(pcx, cy, D / 2, T.on1);
    const ri = D / 2 - px(5);
    pg.circle(pcx, cy, ri, T.c1t2);
    if (this.hasPhoto) pg.image('photo', pcx - ri, cy - ri, ri * 2, ri * 2, 'cover', { clip: 'circle' });
    else {
      const ini = initials(a.name);
      if (ini) pg.text(pcx, baseline(cy - lh(48, 1) / 2, 48, 1), ini, 'c800', 48, T.c1ink, { anchor: 'middle' });
    }

    // coluna lateral: escudo no topo e marca Lab-4 na base
    const sideW = px(118);
    const sideX = right - sideW;
    const logoColor = T.lightOn ? '#FFFFFF' : '#000000';
    if (this.club.crest) {
      const cd = px(100);
      const ccx = sideX + sideW / 2;
      pg.circle(ccx, cTop + cd / 2, cd / 2, C.white);
      const ib = px(74);
      this.crest(pg, ccx - ib / 2, cTop + (cd - ib) / 2, ib, ib);
      const ld = px(88);
      pg.logo(ccx - ld / 2, cBot - ld, ld, logoColor);
    } else {
      const ld = px(112);
      pg.logo(sideX + (sideW - ld) / 2, cy - ld / 2, ld, logoColor);
    }

    // bloco central: rótulo, nome, fatos
    const mx = x0 + D + px(26);
    const mw = sideX - px(26) - mx;
    const name = clean(a.name);
    const nameText = name ? UP(name) : 'NOME DO ATLETA';
    let size = fp(33);
    let lines = null;
    for (const cand of [fp(58), fp(50), fp(44), fp(38), fp(33)]) {
      const w = wrap(this.m, nameText, 'c800', cand, mw);
      if (w.length <= 2) { size = cand; lines = w; break; }
    }
    if (!lines) lines = wrap(this.m, nameText, 'c800', size, mw);
    const nameLH = lh(size, 0.96);

    const facts = [];
    if (trim(a.category)) facts.push(['Categoria', clean(a.category)]);
    if (parseISO(a.birth)) facts.push(['Nascimento', brDate(a.birth)]);
    if (this.club.name) facts.push(['Clube', this.club.name]);
    const fL = fp(10.5);
    const fV = fp(19);
    const factW = facts.map(([l, v]) => Math.max(this.m(l, 'b600', fL), this.m(v, 'c700', fV)));
    const rows = [];
    let cur = [];
    let used = 0;
    facts.forEach((f, i) => {
      const w = factW[i];
      if (cur.length && used + px(22) + w > mw) { rows.push(cur); cur = []; used = 0; }
      used += (cur.length ? px(22) : 0) + w;
      cur.push(i);
    });
    if (cur.length) rows.push(cur);
    const factRowH = lh(fL, 1.42) + px(1) + lh(fV, 1.1);

    const kick = fp(13);
    const hK = lh(kick, 1.42);
    const hN = lines.length * nameLH + px(2);
    const hF = rows.length ? rows.length * factRowH + (rows.length - 1) * px(22) * 0.5 : 0;
    const total = hK + px(6) + hN + (rows.length ? px(14) + hF : 0);
    let ty = cy - total / 2;
    pg.text(mx, baseline(ty, kick, 1.42), 'Planejamento individual de treino', 'b600', kick, mix(T.on1, T.c1, 0.18));
    ty += hK + px(6);
    const nameColor = name ? T.on1 : mix(T.on1, T.c1, 0.55);
    lines.forEach((ln) => {
      pg.text(mx, baseline(ty, size, 0.96), ln, 'c800', size, nameColor, { ls: 0.005 });
      ty += nameLH;
    });
    ty += px(2) + px(14);
    const lblColor = mix(T.on1, T.c1, 0.22);
    rows.forEach((row) => {
      let fx = mx;
      row.forEach((i) => {
        const [l, v] = facts[i];
        pg.text(fx, baseline(ty, fL, 1.42), l, 'b600', fL, lblColor);
        pg.text(fx, baseline(ty + lh(fL, 1.42) + px(1), fV, 1.1), v, 'c700', fV, T.on1);
        fx += factW[i] + px(22);
      });
      ty += factRowH + px(11);
    });
  }

  runHead(pg) {
    const { T } = this;
    const { x0, right, runH } = PAGE;
    const a = this.s.athlete;
    pg.rect(0, runH - px(3), PAGE.w, px(3), T.c1);
    const mid = (runH - px(3)) / 2;
    let tx = x0;
    if (this.club.crest) {
      const cb = px(34);
      this.crest(pg, x0, mid - cb / 2, cb, cb);
      tx += cb + px(12);
    }
    const ln = px(42);
    pg.logo(right - ln, mid - ln / 2, ln, '#000000');
    const maxW = right - ln - px(12) - tx;
    const nameS = fp(20);
    const subS = fp(11);
    const blockH = lh(nameS, 1) + px(2) + lh(subS, 1.42);
    const top = mid - blockH / 2;
    pg.text(tx, baseline(top, nameS, 1), ellipsize(this.m, UP(a.name) || 'NOME DO ATLETA', 'c800', nameS, maxW), 'c800', nameS, C.ink);
    const parts = ['Planejamento individual de treino', clean(a.category), periodOf(this.s)].filter(Boolean);
    pg.text(tx, baseline(top + lh(nameS, 1) + px(2), subS, 1.42), ellipsize(this.m, parts.join('  |  '), 'b400', subS, maxW), 'b400', subS, C.muted);
  }

  footer(pg, total) {
    const { x0, right, footTop, footH } = PAGE;
    pg.screen = false;
    pg.hline(x0, footTop, PAGE.cw, C.line);
    const cy = footTop + footH / 2;
    const lg = px(22);
    pg.logo(x0, cy - lg / 2, lg, '#000000');
    const S = fp(9.5);
    const bl = cy + 0.35 * S * (25.4 / 72);
    let x = x0 + lg + px(10);
    pg.text(x, bl, 'Lab-4 Performance', 'b700', S, C.ink);
    x += this.m('Lab-4 Performance', 'b700', S) + this.m(' ', 'b400', S);
    const sub = 'Centro de treinamento de performance do futebol';
    pg.text(x, bl, sub, 'b400', S, C.muted);
    x += this.m(sub, 'b400', S) + px(18);
    pg.text(x, bl, `Emitido em ${this.issued}`, 'b400', S, C.muted);
    pg.text(right, bl, `Página ${pg.n} de ${total}`, 'b600', S, C.ink, { anchor: 'end' });
  }

  /** Escudo: imagem (oficial ou enviada) ou monograma vetorial provisório. */
  crest(pg, x, y, w, h) {
    const cr = this.club.crest;
    if (!cr) return;
    if (cr.kind === 'image') { pg.image(cr.ref, x, y, w, h, 'contain'); return; }
    const sc = Math.min(w / 200, h / 224);
    const ox = x + (w - 200 * sc) / 2;
    const oy = y + (h - 224 * sc) / 2;
    const P = (vx, vy) => `${f3(ox + vx * sc)} ${f3(oy + vy * sc)}`;
    const d = `M${P(18, 16)}L${P(182, 16)}L${P(182, 112)}Q${P(182, 184)} ${P(100, 212)}Q${P(18, 184)} ${P(18, 112)}Z`;
    const on = onColor(this.club.primary, this.club.secondary);
    pg.path(d, { fill: this.club.primary, stroke: on, sw: 9 * sc });
    const fs = (cr.text.length > 2 ? 62 : 78) * sc / (25.4 / 72);
    pg.text(ox + 100 * sc, oy + 110 * sc + 0.35 * fs * (25.4 / 72), cr.text, 'c800', fs, on, { anchor: 'middle' });
  }

  /** Ícone de bola (vetorial) usado no rótulo de transferência. */
  ball(pg, x, y, size, color) {
    const s = size / 64;
    const cx = x + 32 * s;
    const cy = y + 32 * s;
    pg.circle(cx, cy, 27 * s, null, { stroke: color, sw: 4.5 * s });
    const pts = [];
    for (let k = 0; k < 5; k += 1) {
      const ang = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
      pts.push([cx + 10.5 * s * Math.cos(ang), cy + 10.5 * s * Math.sin(ang)]);
    }
    pg.path(`M${pts.map((p) => `${f3(p[0])} ${f3(p[1])}`).join('L')}Z`, { fill: color });
    pts.forEach(([px0, py0]) => {
      const dx = px0 - cx;
      const dy = py0 - cy;
      const L = Math.hypot(dx, dy);
      pg.path(`M${f3(px0)} ${f3(py0)}L${f3(cx + (dx / L) * 27 * s)} ${f3(cy + (dy / L) * 27 * s)}`, { stroke: color, sw: 4.5 * s, cap: 'round' });
    });
  }

  /* ================= blocos da página 1 ================= */
  metaBlock() {
    const { x0, cw } = PAGE;
    const a = this.s.athlete;
    const period = periodOf(this.s);
    const cells = [
      ['Professor responsável', clean(a.coach), 1.35],
      ['Período do planejamento', period, 1.1],
      ['Sessões planejadas', String(this.list.length), 0.75],
    ];
    const sL = fp(10);
    const sV = fp(17);
    const h = px(10) + lh(sL, 1.42) + px(2) + lh(sV, 1.15) + px(10);
    return {
      h,
      draw: (pg, y) => {
        const tot = cells.reduce((acc, c) => acc + c[2], 0);
        let x = x0;
        cells.forEach(([l, v, fr], i) => {
          const w = (cw * fr) / tot;
          if (i) pg.vline(x, y, h, C.line);
          const tx = x + px(14);
          const tw = w - px(28);
          pg.text(tx, baseline(y + px(10), sL, 1.42), l, 'b600', sL, C.muted);
          const val = v || 'A definir';
          pg.text(tx, baseline(y + px(10) + lh(sL, 1.42) + px(2), sV, 1.15), ellipsize(this.m, val, 'c700', sV, tw), 'c700', sV, v ? C.ink : C.phBox);
          x += w;
        });
        pg.rect(x0, y, cw, h, null, { stroke: C.line, sw: px(1), r: px(6) });
      },
    };
  }

  objectiveBlock() {
    const { x0, cw } = PAGE;
    const { T } = this;
    const o = trim(this.s.athlete.objective);
    const hS = fp(19);
    const tS = fp(12.5);
    const tw = cw - px(4) - px(32);
    const lines = wrap(this.m, o || 'Descreva o foco longitudinal do atleta neste ciclo de treinamento.', 'b400', tS, tw);
    const h = px(11) + lh(hS, 1.1) + px(5) + lines.length * lh(tS, 1.5) + px(12);
    return {
      h,
      draw: (pg, y) => {
        pg.rect(x0, y, cw, h, T.c1t, { r: [0, px(6), px(6), 0] });
        pg.rect(x0, y, px(4), h, T.c1);
        const tx = x0 + px(4) + px(16);
        let ty = y + px(11);
        pg.text(tx, baseline(ty, hS, 1.1), 'Objetivo geral', 'c800', hS, T.c1ink);
        ty += lh(hS, 1.1) + px(5);
        lines.forEach((ln) => { pg.text(tx, baseline(ty, tS, 1.5), ln, 'b400', tS, o ? C.ink : C.ph); ty += lh(tS, 1.5); });
      },
    };
  }

  timelineBlock() {
    const dated = this.list.filter((s) => parseISO(s.date));
    if (!dated.length) return null;
    const { x0, cw } = PAGE;
    const { T } = this;
    const groups = [];
    dated.forEach((s) => {
      const p = parseISO(s.date);
      const k = `${p.y}-${p.m}`;
      let g = groups[groups.length - 1];
      if (!g || g.k !== k) { g = { k, p, items: [] }; groups.push(g); }
      g.items.push(s);
    });
    const rows = [];
    groups.forEach((g) => { for (let i = 0; i < g.items.length; i += 6) rows.push({ g, items: g.items.slice(i, i + 6), first: i === 0 }); });

    const hS = fp(19);
    const monS = fp(17);
    const yrS = fp(10);
    const dS = fp(14);
    const wdS = fp(10);
    const fS = fp(10.5);
    const tS = fp(9.5);
    const railX = x0 + px(78) + px(8);
    const nodeW = (cw - px(86)) / 6;
    const innerW = nodeW - px(8);
    const headH = lh(hS, 1.1) + px(2);

    const rowModels = rows.map((r) => {
      const nodes = r.items.map((s) => {
        const focus = wrap(this.m, trim(s.focus) || 'Foco a definir', 'b600', fS, innerW);
        const tags = s.tags.length ? wrap(this.m, s.tags.join(', '), 'b600', tS, innerW) : [];
        const h = px(14) + px(5) + lh(dS, 1.1) + px(2) + focus.length * lh(fS, 1.25) + (tags.length ? px(2) + tags.length * lh(tS, 1.3) : 0);
        return { s, focus, tags, h };
      });
      const monthH = r.first ? lh(monS, 1) + px(3) + lh(yrS, 1.3) : 0;
      const inner = Math.max(monthH, ...nodes.map((n) => n.h));
      return { r, nodes, h: px(8) + inner + px(10) };
    });
    const h = headH + rowModels.reduce((acc, r) => acc + r.h, 0);
    return {
      h,
      draw: (pg, y) => {
        pg.text(x0, baseline(y, hS, 1.1), 'Visão geral das sessões', 'c800', hS, T.c1ink);
        let ry = y + headH;
        rowModels.forEach((rm, ri) => {
          if (ri) pg.path(`M${f3(x0)} ${f3(ry + px(0.5))}H${f3(x0 + cw)}`, { stroke: C.line, sw: px(1), dash: [px(3), px(3)] });
          const top = ry + px(8);
          if (rm.r.first) {
            pg.text(x0, baseline(top + px(1), monS, 1), MON_FULL[rm.r.g.p.m - 1], 'c800', monS, C.ink);
            pg.text(x0, baseline(top + px(1) + lh(monS, 1) + px(3), yrS, 1.3), String(rm.r.g.p.y), 'b600', yrS, C.muted);
          }
          if (rm.nodes.length > 1) pg.rect(railX + px(7), top + px(6), (rm.nodes.length - 1) * nodeW, px(2), T.c1l);
          rm.nodes.forEach((nd, i) => {
            const nx = railX + i * nodeW;
            pg.circle(nx + px(7), top + px(7), px(7), C.white);
            pg.circle(nx + px(7), top + px(7), px(4), T.c1);
            const p = parseISO(nd.s.date);
            let ty = top + px(19);
            const dt = `${pad2(p.d)}/${pad2(p.m)}`;
            pg.text(nx, baseline(ty, dS, 1.1), dt, 'c700', dS, C.ink);
            pg.text(nx + this.m(dt, 'c700', dS) + px(3), baseline(ty, dS, 1.1), WD[p.wd], 'b400', wdS, C.muted);
            ty += lh(dS, 1.1) + px(2);
            nd.focus.forEach((ln) => { pg.text(nx, baseline(ty, fS, 1.25), ln, 'b600', fS, C.ink); ty += lh(fS, 1.25); });
            if (nd.tags.length) {
              ty += px(2);
              nd.tags.forEach((ln) => { pg.text(nx, baseline(ty, tS, 1.3), ln, 'b600', tS, T.c1ink); ty += lh(tS, 1.3); });
            }
          });
          ry += rm.h;
        });
      },
    };
  }

  /** Aviso apenas de tela (não sai no PDF) quando ainda não há sessões. */
  placeholderBlock() {
    const { x0, cw } = PAGE;
    const S = fp(13);
    const h = px(26) * 2 + lh(S, 1.42) + px(4);
    return {
      h,
      draw: (pg, y) => {
        pg.screen = true;
        pg.rect(x0 + px(1), y + px(1), cw - px(2), h - px(2), null, { stroke: C.line, sw: px(2), r: px(7), dash: [px(6), px(4)] });
        pg.text(x0 + cw / 2, baseline(y + px(28), S, 1.42), 'As sessões adicionadas no formulário aparecem aqui, em ordem de data.', 'b400', S, C.ph, { anchor: 'middle' });
        pg.screen = false;
      },
    };
  }

  /* ================= cartão de sessão ================= */
  cardModel(s, num, total) {
    const { x0, cw } = PAGE;
    const { T } = this;
    const m = this.m;
    const padX = px(16);
    const dateW = px(78);
    const titleW = cw - dateW;
    const innerX = x0 + padX;
    const innerW = cw - 2 * padX;

    /* ---- cabeçalho ---- */
    const p = parseISO(s.date);
    const dayS = fp(32); const monS = fp(14); const wdS = fp(10);
    const dateContent = lh(dayS, 0.95) + lh(monS, 1.1) + (p ? lh(wdS, 1.3) : 0);
    const dateH = px(9) + dateContent + px(8);

    const numS = fp(10.5); const tagS = fp(10); const focS = fp(22);
    const focusText = trim(s.focus);
    const focusLines = focusText
      ? wrap(m, UP(focusText), 'c800', focS, titleW - 2 * padX)
      : wrap(m, 'Foco da sessão a definir', 'c700', focS, titleW - 2 * padX);
    const pillH = lh(tagS, 1.35) + px(3);
    const pillW = s.tags.map((t) => m(t, 'b700', tagS) + px(18) + px(2.6));
    const numText = (cont) => `Sessão ${num} de ${total}${cont ? ' (continuação)' : ''}`;
    const tagRows = (cont) => {
      const avail = titleW - 2 * padX - m(numText(cont), 'b600', numS) - px(10);
      const out = [];
      let row = [];
      let used = 0;
      s.tags.forEach((t, i) => {
        const w = pillW[i];
        if (row.length && used + px(5) + w > avail) { out.push(row); row = []; used = 0; }
        used += (row.length ? px(5) : 0) + w;
        row.push(i);
      });
      if (row.length) out.push(row);
      return out;
    };
    const titleH = (cont) => {
      const tr = tagRows(cont);
      const topLine = Math.max(lh(numS, 1.42), tr.length ? tr.length * pillH + (tr.length - 1) * px(4) : 0);
      return px(9) + topLine + px(3) + focusLines.length * lh(focS, 1.05) + px(1) + px(10);
    };
    const headH = (cont) => Math.max(dateH, titleH(cont));

    /* ---- contexto ---- */
    const ctxText = trim(s.context);
    const ctxLblS = fp(10.5); const ctxS = fp(11.5);
    const ctxLbl = 'Contexto pré-sessão';
    const ctxLblW = m(ctxLbl, 'b700', ctxLblS);
    const ctxLines = ctxText ? wrap(m, ctxText, 'b400', ctxS, innerW - ctxLblW - px(10)) : [];
    const ctxH = ctxText ? px(1) + px(8) + Math.max(lh(ctxLblS, 1.42), ctxLines.length * lh(ctxS, 1.42)) + px(8) : 0;

    /* ---- preparação ---- */
    const prep = s.prep.filter((x) => trim(x.text) || trim(x.vol) || x.type !== 'Outro');
    const ptS = fp(9.5); const pxS = fp(11.2); const pvS = fp(12.5); const plS = fp(10.5);
    const longPrep = prep.some((x) => (x.text || '').length > 70);
    const cols = longPrep || prep.length === 1 ? 1 : 2;
    const colW = cols === 2 ? (innerW - px(18)) / 2 : innerW;
    const prepItems = prep.map((x) => {
      const t = clean(x.text);
      const txt = t.toLocaleLowerCase('pt-BR') === x.type.toLocaleLowerCase('pt-BR') ? '' : t;
      const pw = m(x.type, 'b700', ptS) + px(12);
      const vol = clean(x.vol);
      const vw = vol ? m(vol, 'c700', pvS) : 0;
      const tw = colW - pw - px(7) - (vol ? vw + px(7) : 0);
      const lines = txt ? wrap(m, txt, 'b400', pxS, Math.max(tw, px(30))) : [''];
      const ph = lh(ptS, 1.35) + px(2);
      return { type: x.type, lines, vol, pw, vw, h: Math.max(ph, lines.length * lh(pxS, 1.35)), ph };
    });
    const prepRows = [];
    for (let i = 0; i < prepItems.length; i += cols) prepRows.push(prepItems.slice(i, i + cols));
    const prepH = prep.length
      ? px(1) + px(9) + lh(plS, 1.42) + px(5) + prepRows.reduce((acc, r) => acc + Math.max(...r.map((it) => it.h)), 0) + (prepRows.length - 1) * px(4) + px(10)
      : 0;

    /* ---- exercícios ---- */
    const c0 = px(22); const c2 = px(64); const cg = px(12);
    const rest = innerW - c0 - c2 - 3 * cg;
    const colA = rest / 2.3;
    const colB = (rest * 1.3) / 2.3;
    const xN = innerX; const xName = xN + c0 + cg; const xVol = xName + colA + cg; const xTr = xVol + c2 + cg;
    const hdS = fp(9.8);
    const exHdH = px(1) + px(7) + lh(hdS, 1.42) + px(5);
    const nmS = fp(12); const ldS = fp(10.5); const vS = fp(16); const trS = fp(11.3); const tvS = fp(12.5); const nS = fp(12.5);
    const trTextW = colB - px(3) - px(20);
    const rows = s.exercises.map((e) => {
      const name = wrap(m, trim(e.name) || 'Exercício sem nome', 'b600', nmS, colA);
      const load = trim(e.load) ? wrap(m, `Carga/tempo: ${clean(e.load)}`, 'b400', ldS, colA) : [];
      const leftH = name.length * lh(nmS, 1.35) + (load.length ? px(2) + load.length * lh(ldS, 1.42) : 0);
      const vol = trim(e.sets) ? wrap(m, clean(e.sets), 'c800', vS, c2) : null;
      const volH = (vol ? vol.length : 1) * lh(vS, 1.1) + px(1);
      const tr = trim(e.transfer);
      const trLines = wrap(m, tr || 'Transferência não definida', 'b400', trS, trTextW);
      const tv = trim(e.tvol) ? `Volume ${clean(e.tvol)}` : '';
      const panelH = px(6) + trLines.length * lh(trS, 1.38) + (tv ? px(4) + lh(tvS, 1.1) : 0) + px(7);
      const inner = Math.max(leftH, volH, panelH, px(22));
      return { e, name, load, vol, trLines, hasTr: !!tr, tv, inner, h: px(1) + px(7) + inner + px(8) };
    });
    const noteS = fp(10);
    const noteH = px(1) + px(6) + lh(noteS, 1.42) + px(7);
    const emptyS = fp(11);
    const emptyH = px(1) + px(10) + lh(emptyS, 1.42) + px(10);
    const n = s.exercises.length;

    const pieceH = (from, to, cont) => {
      let h = headH(cont);
      if (!cont) h += ctxH + prepH;
      if (n) {
        if (to > from) h += exHdH + rows.slice(from, to).reduce((acc, r) => acc + r.h, 0);
      } else if (!cont) h += emptyH;
      if (to < n) h += noteH;
      return h;
    };

    const drawPiece = (pg, y0, from, to, cont) => {
      const hh = headH(cont);
      const H = pieceH(from, to, cont);
      const r = px(7);
      // cabeçalho: data (cor do clube) e título (tom claro)
      pg.path(roundRectPath(x0, y0, dateW, hh, [r, 0, 0, 0]), { fill: T.c1 });
      pg.path(roundRectPath(x0 + dateW, y0, titleW, hh, [0, r, 0, 0]), { fill: T.c1t });
      const dcx = x0 + dateW / 2;
      let dy = y0 + (hh - dateContent) / 2;
      if (p) {
        pg.text(dcx, baseline(dy, dayS, 0.95), pad2(p.d), 'c800', dayS, T.on1, { anchor: 'middle' });
        dy += lh(dayS, 0.95);
        pg.text(dcx, baseline(dy, monS, 1.1), `${MON[p.m - 1]} ${p.y}`.toLocaleUpperCase('pt-BR'), 'c700', monS, T.on1, { anchor: 'middle' });
        dy += lh(monS, 1.1);
        pg.text(dcx, baseline(dy, wdS, 1.3), WD_FULL[p.wd], 'b400', wdS, mix(T.on1, T.c1, 0.15), { anchor: 'middle' });
      } else {
        pg.text(dcx, baseline(dy, dayS, 0.95), '–', 'c800', dayS, T.on1, { anchor: 'middle' });
        dy += lh(dayS, 0.95);
        pg.text(dcx, baseline(dy, monS, 1.1), 'SEM DATA', 'c700', monS, T.on1, { anchor: 'middle' });
      }
      const tx = x0 + dateW + padX;
      const tRight = x0 + cw - padX;
      const th = titleH(cont);
      let ty = y0 + (hh - th) / 2 + px(9);
      const tr = tagRows(cont);
      const topLine = Math.max(lh(numS, 1.42), tr.length ? tr.length * pillH + (tr.length - 1) * px(4) : 0);
      pg.text(tx, baseline(ty + (tr.length ? (pillH - lh(numS, 1.42)) / 2 : 0), numS, 1.42), numText(cont), 'b600', numS, C.muted);
      tr.forEach((row, ri) => {
        let rx = tRight;
        const py = ty + ri * (pillH + px(4));
        [...row].reverse().forEach((i) => {
          const w = pillW[i];
          rx -= w;
          pg.rect(rx + px(0.65), py + px(0.65), w - px(1.3), pillH - px(1.3), null, { stroke: T.c1ink, sw: px(1.3), r: pillH / 2 });
          pg.text(rx + w / 2, baseline(py, tagS, pillH / (tagS * (25.4 / 72))), s.tags[i], 'b700', tagS, T.c1ink, { anchor: 'middle' });
          rx -= px(5);
        });
      });
      ty += topLine + px(3);
      focusLines.forEach((ln) => {
        pg.text(tx, baseline(ty, focS, 1.05), ln, focusText ? 'c800' : 'c700', focS, focusText ? T.c1ink : C.ph);
        ty += lh(focS, 1.05);
      });

      let y = y0 + hh;
      if (!cont && ctxH) {
        pg.rect(x0, y, cw, ctxH, C.ctxBg);
        pg.hline(x0, y, cw, C.ctxLine);
        const top = y + px(1) + px(8);
        pg.text(innerX, baseline(top, ctxS, 1.42), ctxLbl, 'b700', ctxLblS, C.ctxInk);
        let ly = top;
        ctxLines.forEach((ln) => { pg.text(innerX + ctxLblW + px(10), baseline(ly, ctxS, 1.42), ln, 'b400', ctxS, C.ctxInk); ly += lh(ctxS, 1.42); });
        y += ctxH;
      }
      if (!cont && prepH) {
        pg.hline(x0, y, cw, C.line);
        let py = y + px(1) + px(9);
        pg.text(innerX, baseline(py, plS, 1.42), 'Preparação', 'b700', plS, T.c1ink);
        py += lh(plS, 1.42) + px(5);
        prepRows.forEach((row, ri) => {
          if (ri) py += px(4);
          row.forEach((it, ci) => {
            const cx = innerX + ci * (colW + px(18));
            const bl = baseline(py, pxS, 1.35);
            const pillY = py + (lh(pxS, 1.35) - it.ph) / 2;
            pg.rect(cx, pillY, it.pw, it.ph, C.band, { r: px(3) });
            pg.text(cx + px(6), baseline(pillY + px(1), ptS, 1.35), it.type, 'b700', ptS, C.ink);
            let ly = py;
            it.lines.forEach((ln) => { pg.text(cx + it.pw + px(7), baseline(ly, pxS, 1.35), ln, 'b400', pxS, C.ink); ly += lh(pxS, 1.35); });
            if (it.vol) pg.text(cx + colW, bl, it.vol, 'c700', pvS, T.c1ink, { anchor: 'end' });
          });
          py += Math.max(...row.map((it) => it.h));
        });
        y += prepH;
      }
      if (n && to > from) {
        pg.hline(x0, y, cw, C.line);
        const hy = y + px(1) + px(7);
        const hb = baseline(hy, hdS, 1.42);
        pg.text(xName, hb, 'Exercício principal', 'b700', hdS, C.muted);
        pg.text(xVol, hb, 'Volume', 'b700', hdS, C.muted);
        const bs = px(12);
        this.ball(pg, xTr, hy + (lh(hdS, 1.42) - bs) / 2, bs, T.c1ink);
        pg.text(xTr + bs + px(5), hb, 'Transferência para o futebol', 'b700', hdS, T.c1ink);
        y += exHdH;
        for (let k = from; k < to; k += 1) {
          const rw = rows[k];
          pg.hline(x0 + px(1), y, cw - px(2), C.band);
          const top = y + px(1) + px(7);
          const cr = px(10.5);
          pg.circle(xN + cr, top + px(1) + cr, cr - px(0.75), null, { stroke: T.c1ink, sw: px(1.5) });
          pg.text(xN + cr, baseline(top + px(1) + cr - lh(nS, 1) / 2, nS, 1), String(k + 1), 'c800', nS, T.c1ink, { anchor: 'middle' });
          let ly = top;
          rw.name.forEach((ln) => { pg.text(xName, baseline(ly, nmS, 1.35), ln, 'b600', nmS, C.ink); ly += lh(nmS, 1.35); });
          if (rw.load.length) {
            ly += px(2);
            rw.load.forEach((ln) => { pg.text(xName, baseline(ly, ldS, 1.42), ln, 'b400', ldS, C.muted); ly += lh(ldS, 1.42); });
          }
          let vy = top + px(1);
          if (rw.vol) rw.vol.forEach((ln) => { pg.text(xVol, baseline(vy, vS, 1.1), ln, 'c800', vS, C.ink); vy += lh(vS, 1.1); });
          else pg.text(xVol, baseline(vy, vS, 1.1), '–', 'c700', vS, C.faint);
          pg.rect(xTr, top, colB, rw.inner, T.c1t, { r: [0, px(5), px(5), 0] });
          pg.rect(xTr, top, px(3), rw.inner, T.c1);
          let ty2 = top + px(6);
          rw.trLines.forEach((ln) => { pg.text(xTr + px(13), baseline(ty2, trS, 1.38), ln, 'b400', trS, rw.hasTr ? C.ink : C.ph); ty2 += lh(trS, 1.38); });
          if (rw.tv) pg.text(xTr + colB - px(10), baseline(top + rw.inner - px(7) - lh(tvS, 1.1), tvS, 1.1), rw.tv, 'c700', tvS, T.c1ink, { anchor: 'end' });
          y += rw.h;
        }
      } else if (!n && !cont) {
        pg.hline(x0, y, cw, C.line);
        pg.text(innerX, baseline(y + px(1) + px(10), emptyS, 1.42), 'Sem exercícios principais cadastrados.', 'b400', emptyS, C.ph);
        y += emptyH;
      }
      if (to < n) {
        pg.path(`M${f3(x0 + px(1))} ${f3(y + px(0.5))}H${f3(x0 + cw - px(1))}`, { stroke: C.line, sw: px(1), dash: [px(3), px(3)] });
        pg.text(x0 + cw - padX, baseline(y + px(1) + px(6), noteS, 1.42), 'Continua na próxima página', 'b400', noteS, C.muted, { anchor: 'end' });
      }
      // borda do cartão por cima de tudo
      pg.rect(x0 + px(0.5), y0 + px(0.5), cw - px(1), H - px(1), null, { stroke: C.line, sw: px(1), r: r - px(0.5) });
    };

    return {
      piece: (from, to, cont) => ({ h: pieceH(from, to, cont), draw: (pg, y) => drawPiece(pg, y, from, to, cont) }),
    };
  }
}

