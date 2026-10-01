/**
 * Testes do motor de relatório (layout + PDF), executados em Node: `npm test`.
 * Garantem as diretrizes da versão web: A4 exato, nada fora da folha, cartões de sessão
 * nunca cortados no meio de um exercício, detecção de excesso e PDF leve para o WhatsApp.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { layoutPlan, PAGE } from '../src/report/layout.js';
import { renderPdf, A4_PT } from '../src/report/pdf.js';
import { CLUBS, OTHER } from '../src/core/config.js';
import { defaults, hydrate, legacyImages, newExercise, sample } from '../src/core/model.js';
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
