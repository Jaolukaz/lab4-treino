/**
 * Testes do motor de relatório (layout + PDF), executados em Node: `npm test`.
 * Garantem as diretrizes da versão web: A4 exato, nada fora da folha, cartões de sessão
 * nunca cortados no meio de um exercício, detecção de excesso e PDF leve para o WhatsApp.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { layoutPlan, PAGE, px } from '../src/report/layout.js';
import { renderPdf, A4_PT } from '../src/report/pdf.js';
import { CLUBS, OTHER, PREP_QUICK, PREP_TYPES } from '../src/core/config.js';
import { defaults, fmtNum, heightText, hydrate, legacyImages, measureHint, newExercise, parseMeasure, sample, weightText } from '../src/core/model.js';
import { contrast, themeOf } from '../src/core/theme.js';
import { loadAssets } from './helpers.mjs';

const ctxOf = (a, extra = {}) => ({ measure: a.measure, issued: '29/09/2026', ...extra });
const texts = (pages) => pages.flatMap((p) => p.items.filter((it) => it.t === 'text').map((it) => ({ n: p.n, s: it.s })));

function assertInside(a, pages) {
  for (const pg of pages) {
    for (const it of pg.items) {
      if (it.t === 'rect' || it.t === 'image') {
        assert.ok(it.x >= -0.01 && it.y >= -0.01 && it.x + it.w <= PAGE.w + 0.01 && it.y + it.h <= PAGE.h + 0.01, `item fora da folha na página ${pg.n}`);
      }
      if (it.t === 'text') {
        const w = a.measure(it.s, it.f, it.size, it.ls);
        const x0 = it.anchor === 'end' ? it.x - w : it.anchor === 'middle' ? it.x - w / 2 : it.x;
        assert.ok(x0 >= PAGE.x0 - 0.01 && x0 + w <= PAGE.right + 0.3, `texto excede a margem na página ${pg.n}: "${it.s}"`);
        assert.ok(it.y <= PAGE.h - 2, `texto abaixo da folha na página ${pg.n}`);
      }
    }
  }
}

test('planejamento de exemplo: 6 páginas A4, sem excesso e dentro das margens', async () => {
  const a = await loadAssets({ photo: true });
  const { pages, overflowPages } = layoutPlan(sample(), ctxOf(a, { photo: true }));
  assert.equal(pages.length, 6);
  assert.deepEqual(overflowPages, []);
  assertInside(a, pages);
  const doc = await PDFDocument.load(await renderPdf(pages, a));
  assert.equal(doc.getPageCount(), 6);
  for (const p of doc.getPages()) {
    const { width, height } = p.getSize();
    assert.ok(Math.abs(width - A4_PT[0]) < 0.01 && Math.abs(height - A4_PT[1]) < 0.01, 'página não é A4');
  }
  const all = texts(pages).map((t) => t.s);
  assert.ok(all.includes('Página 6 de 6'));
  assert.ok(all.includes('Transferência para o futebol'));
});

test('planejamento vazio: 1 página, e o aviso de tela não entra no PDF', async () => {
  const a = await loadAssets();
  const { pages, overflowPages } = layoutPlan(defaults(), ctxOf(a));
  assert.equal(pages.length, 1);
  assert.deepEqual(overflowPages, []);
  assert.ok(pages[0].items.some((it) => it.screen), 'aviso da prévia ausente');
  const doc = await PDFDocument.load(await renderPdf(pages, a));
  assert.equal(doc.getPageCount(), 1);
});

test('sessão maior que uma página é dividida entre exercícios, nunca no meio de um', async () => {
  const a = await loadAssets();
  const s = sample();
  const base = s.sessions[0].exercises;
  for (let i = 0; i < 12; i += 1) s.sessions[0].exercises.push({ ...base[i % 3], id: `x${i}` });
  const n = s.sessions[0].exercises.length;
  const { pages, overflowPages } = layoutPlan(s, ctxOf(a));
  assert.deepEqual(overflowPages, []);
  assertInside(a, pages);
  const cont = texts(pages).filter((t) => t.s === 'Sessão 1 de 9 (continuação)');
  assert.ok(cont.length >= 1, 'faltou o cabeçalho de continuação');
  assert.ok(texts(pages).some((t) => t.s === 'Continua na próxima página'));
  // cada número de exercício da sessão 1 aparece uma única vez (círculos numerados)
  const firstSessionPages = new Set([2, ...cont.map((c) => c.n)]);
  const nums = texts(pages).filter((t) => firstSessionPages.has(t.n) && /^\d+$/.test(t.s)).map((t) => +t.s);
  for (let k = 1; k <= n; k += 1) assert.ok(nums.includes(k), `exercício ${k} ausente`);
});

test('exercício sozinho maior que a folha é detectado como excesso', async () => {
  const a = await loadAssets();
  const s = sample();
  s.sessions = [s.sessions[0]];
  s.sessions[0].exercises = [{ ...newExercise(), name: 'Teste', transfer: 'Gesto muito longo. '.repeat(700) }];
  const { overflowPages } = layoutPlan(s, ctxOf(a));
  assert.ok(overflowPages.length >= 1);
});

test('todos os clubes geram o relatório, com escudo oficial ou monograma', async () => {
  const a = await loadAssets();
  for (const key of [...Object.keys(CLUBS), OTHER]) {
    const s = sample();
    s.clubKey = key;
    s.sessions = s.sessions.slice(0, 2);
    const { pages, overflowPages, club } = layoutPlan(s, ctxOf(a));
    assert.deepEqual(overflowPages, [], key);
    if (key !== OTHER) assert.ok(club.crest, `${key} sem escudo`);
    const bytes = await renderPdf(pages, a);
    assert.ok(bytes.length > 1000);
  }
});

test('cores derivadas mantêm contraste legível para todos os clubes', () => {
  for (const [k, c] of Object.entries(CLUBS)) {
    const T = themeOf(c);
    assert.ok(contrast(T.on1, T.c1) >= 3, `${k}: texto sobre a faixa`);
    assert.ok(contrast(T.c1ink, '#FFFFFF') >= 4.5, `${k}: tom de texto sobre branco`);
  }
  const custom = themeOf({ primary: '#FFD400', secondary: '#FFFFFF', accent: '#FFFFFF' });
  assert.ok(contrast(custom.on1, custom.c1) >= 3 && contrast(custom.c1ink, '#FFFFFF') >= 4.5, 'cor clara personalizada');
});

test('arquivo da versão 1 é convertido sem perder dados', () => {
  const v1 = {
    clubKey: 'cruzeiro', custom: { name: '', primary: '#000000', secondary: '#ffffff' },
    crestOverride: { cruzeiro: 'data:image/png;base64,AAAA', invalido: 'data:image/png;base64,BBBB' },
    athlete: { name: 'Fulano', birth: '2015-05-12', category: 'Sub-11', categoryAuto: true, photo: 'data:image/jpeg;base64,CCCC', coach: 'Prof', period: '', objective: 'Obj' },
    sessions: [{ id: 'a', date: '2026-03-02', tags: ['Lúdico'], context: 'Jogo', focus: 'Força', prep: [{ id: 'p', type: 'Core', text: 'Prancha', vol: '3x' }], exercises: [{ id: 'e', name: 'Stiff', sets: '4-5-6', load: '', transfer: 'Aceleração', tvol: '1-2-2' }] }],
  };
  const s = hydrate(v1);
  assert.equal(s.clubKey, 'cruzeiro');
  assert.equal(s.athlete.name, 'Fulano');
  assert.equal(s.sessions[0].exercises[0].tvol, '1-2-2');
  assert.equal(s.sessions[0].prep[0].type, 'Core');
  assert.ok(!('photo' in s.athlete), 'imagem não deve ficar no estado');
  const li = legacyImages(v1);
  assert.ok(li.photo.startsWith('data:image/jpeg'));
  assert.deepEqual(Object.keys(li.crests), ['cruzeiro']);
});

test('PDF leve para envio pelo WhatsApp (fontes em subconjunto)', async () => {
  const a = await loadAssets();
  const bytes = await renderPdf(layoutPlan(sample(), ctxOf(a)).pages, a);
  assert.ok(bytes.length < 200_000, `PDF sem foto com ${bytes.length} bytes`);
});

test('logo da Lab-4 é vetorial: nenhuma imagem de logo no PDF, só escudo e foto rasterizados', async () => {
  const a = await loadAssets({ photo: true });
  const { pages } = layoutPlan(sample(), ctxOf(a, { photo: true }));
  const refs = new Set(pages.flatMap((p) => p.items.filter((it) => it.t === 'image').map((it) => it.ref)));
  assert.deepEqual([...refs].sort(), ['club:america', 'photo']);
  const logos = pages.flatMap((p) => p.items.filter((it) => it.t === 'vector'));
  assert.equal(logos.length, 2 + 2 * (pages.length - 1), 'capa (logo) + rodapés + cabeçalhos');
  const doc = await PDFDocument.load(await renderPdf(pages, a));
  assert.equal(doc.getPageCount(), pages.length);
});

/* ---------------- 2.1.0: altura, peso e atalho de preparação ---------------- */

test('medidas aceitam vírgula ou ponto e são formatadas no padrão brasileiro', () => {
  assert.equal(parseMeasure('68,5'), 68.5);
  assert.equal(parseMeasure('68.5'), 68.5);
  assert.equal(parseMeasure(' 175 cm '), 175);
  assert.equal(parseMeasure('68,5kg'), 68.5);
  assert.equal(parseMeasure(68.5), 68.5);
  for (const bad of ['', '   ', 'abc', '68,5,1', '-5', '0', 'cm', null, undefined, NaN, Infinity, -3]) assert.equal(parseMeasure(bad), null, String(bad));
  assert.equal(fmtNum(68.5), '68,5');
  assert.equal(fmtNum(175), '175');
  assert.equal(fmtNum(68.25), '68,25');
  assert.equal(heightText('175'), '175 cm');
  assert.equal(weightText('68.5'), '68,5 kg');
  assert.equal(heightText(''), '');
  assert.equal(weightText('abc'), '', 'valor inválido não gera unidade isolada');
  assert.equal(measureHint('height', ''), '');
  assert.equal(measureHint('height', '175'), '');
  assert.match(measureHint('height', '1,75'), /centímetros/);
  assert.match(measureHint('weight', 'abc'), /não sai no PDF/);
});

test('altura e peso: planejamentos e arquivos antigos continuam válidos', () => {
  const old = { athlete: { name: 'Fulano', coach: 'Prof' }, sessions: [] };
  const s = hydrate(old);
  assert.equal(s.athlete.height, '');
  assert.equal(s.athlete.weight, '');
  assert.equal(s.athlete.name, 'Fulano');
  assert.equal(defaults().athlete.height, '');
  const viaNumero = hydrate({ athlete: { height: 175, weight: 68.5 }, sessions: [] });
  assert.equal(viaNumero.athlete.height, '175');
  assert.equal(viaNumero.athlete.weight, '68,5');
  const lixo = hydrate({ athlete: { height: { x: 1 }, weight: null }, sessions: [] });
  assert.equal(lixo.athlete.height, '');
  assert.equal(lixo.athlete.weight, '');
  // ida e volta pelo JSON preserva o que foi digitado
  const s2 = sample();
  s2.athlete.height = '175';
  s2.athlete.weight = '68,5';
  const back = hydrate(JSON.parse(JSON.stringify(s2)));
  assert.equal(back.athlete.height, '175');
  assert.equal(back.athlete.weight, '68,5');
});

/** Textos da coluna central da capa (rótulo, nome e fatos). */
function coverBlock(a, s) {
  const { pages } = layoutPlan(s, ctxOf(a, { photo: true }));
  const items = pages[0].items.filter((it) => it.t === 'text' && it.y < PAGE.coverH);
  const mx = PAGE.x0 + px(172) + px(26);
  const mw = PAGE.right - px(118) - px(26) - mx;
  const central = items.filter((it) => it.x >= mx - 0.01 && it.x < mx + mw);
  return { pages, central, mx, mw };
}

test('capa com os cinco campos: rótulos, valores e unidades corretos, dentro da coluna e da faixa', async () => {
  const a = await loadAssets({ photo: true });
  const cases = [
    { club: OTHER, custom: 'Itabirito FC', name: 'Fulaninho de Oliveira Silva', h: '175', w: '68,5', rows: 1 },
    { club: 'america', name: 'Atleta Exemplo da Silva', h: '142', w: '36.5', rows: 1 },
    { club: 'bragantino', name: 'Pedro Henrique de Oliveira Albuquerque', h: '181', w: '74,5', rows: 2 },
    { club: OTHER, custom: 'Associação Atlética Ponte Preta de Campinas', name: 'Ana', h: '183,5', w: '79,25', rows: 2, clubLast: true },
    { club: OTHER, custom: 'Associação Atlética Ponte Preta de Campinas', name: 'Pedro Henrique de Oliveira Albuquerque', h: '183,5', w: '79,25', rows: 2, clubLast: true },
  ];
  for (const c of cases) {
    const s = sample();
    s.clubKey = c.club;
    if (c.custom) s.custom.name = c.custom;
    Object.assign(s.athlete, { name: c.name, category: 'Sub-14', birth: '2012-01-03', height: c.h, weight: c.w });
    const { pages, central, mx, mw } = coverBlock(a, s);
    assertInside(a, pages);
    const txt = central.map((it) => it.s);
    for (const lbl of ['Categoria', 'Nascimento', 'Clube', 'Altura', 'Peso']) assert.ok(txt.includes(lbl), `${c.name}: falta ${lbl}`);
    assert.ok(txt.includes(`${fmtNum(parseMeasure(c.h))} cm`) && txt.includes(`${fmtNum(parseMeasure(c.w))} kg`), `${c.name}: medidas`);
    const crestCol = PAGE.right - px(118);
    for (const it of central) {
      const w = a.measure(it.s, it.f, it.size, it.ls);
      // o nome (c800) pode usar a margem de 26 px antes do escudo, como na versão aprovada; os campos não
      const limit = it.f === 'c800' ? crestCol : mx + mw;
      assert.ok(it.x + w <= limit + 0.01, `"${it.s}" invade a coluna do escudo`);
      assert.ok(it.y > px(16) && it.y < PAGE.coverH - px(8) - px(2), `"${it.s}" fora da faixa colorida`);
    }
    // ordem preservada: campos aprovados primeiro, medidas depois; e número de linhas esperado
    const labels = central.filter((it) => ['Categoria', 'Nascimento', 'Clube', 'Altura', 'Peso'].includes(it.s));
    assert.deepEqual(labels.map((it) => it.s), c.clubLast
      ? ['Categoria', 'Nascimento', 'Altura', 'Peso', 'Clube']
      : ['Categoria', 'Nascimento', 'Clube', 'Altura', 'Peso']);
    assert.equal(new Set(labels.map((it) => it.y.toFixed(2))).size, c.rows, `${c.name}: linhas de fatos`);
    // Altura e Peso nunca ficam separados em linhas diferentes
    const yOf = (lbl) => labels.find((it) => it.s === lbl).y.toFixed(2);
    assert.equal(yOf('Altura'), yOf('Peso'), `${c.name}: medidas separadas`);
    // em duas linhas, a primeira repete a distribuição aprovada (Categoria, Nascimento, Clube)
    if (c.rows === 2 && !c.clubLast) assert.deepEqual(labels.filter((it) => it.y.toFixed(2) === yOf('Categoria')).map((it) => it.s), ['Categoria', 'Nascimento', 'Clube']);
    // rótulo e valor alinhados à mesma coordenada x
    for (const lab of labels) {
      const val = central.find((it) => it.f === 'c700' && Math.abs(it.x - lab.x) < 0.01 && it.y > lab.y && it.y - lab.y < 8);
      assert.ok(val, `${lab.s}: valor desalinhado`);
    }
  }
});

test('capa sem medidas ou com apenas uma não mostra unidade isolada', async () => {
  const a = await loadAssets();
  for (const [h, w, expect] of [['', '', []], ['175', '', ['Altura']], ['', '68,5', ['Peso']], ['abc', ' ', []]]) {
    const s = sample();
    Object.assign(s.athlete, { height: h, weight: w });
    const txt = coverBlock(a, s).central.map((it) => it.s);
    assert.deepEqual(txt.filter((x) => x === 'Altura' || x === 'Peso'), expect, `${h}|${w}`);
    assert.ok(!txt.some((x) => /^(cm|kg|undefined|null|NaN)$|undefined|NaN/.test(x)), `texto indevido: ${txt.join(' | ')}`);
  }
});

test('atalho "Técnica de Desaceleração": categoria existente, texto completo e presença no PDF', async () => {
  const q = PREP_QUICK.find((x) => x[1] === 'Técnica de Desaceleração');
  assert.ok(q, 'atalho ausente');
  assert.ok(PREP_TYPES.includes(q[0]), 'categoria precisa existir');
  assert.equal(PREP_QUICK.at(-1), q, 'fica depois dos atalhos anteriores');
  const a = await loadAssets();
  const s = hydrate({ ...sample(), sessions: [{ ...sample().sessions[0], prep: [{ id: 'p1', type: q[0], text: q[1], vol: '2×6' }] }] });
  assert.equal(s.sessions[0].prep[0].text, 'Técnica de Desaceleração', 'sobrevive à leitura de arquivo');
  const { pages } = layoutPlan(s, ctxOf(a));
  const txt = pages.flatMap((p) => p.items.filter((it) => it.t === 'text').map((it) => it.s));
  assert.ok(txt.includes('Técnica de Desaceleração') && txt.includes('2×6'));
});
