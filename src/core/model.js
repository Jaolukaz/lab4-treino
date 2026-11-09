/**
 * Modelo de dados do planejamento. Funções puras, sem DOM:
 * usadas pelo formulário, pelo motor de layout do relatório e pelos testes em Node.
 *
 * As imagens (foto do atleta e escudos enviados) ficam fora do estado, no repositório,
 * para que o autosalvamento não reserialize bytes a cada tecla.
 */
import { CLUBS, MON_FULL, OTHER, PREP_TYPES } from './config.js';

export const SCHEMA_VERSION = 2;

export const uid = () => Math.random().toString(36).slice(2, 10);
export const trim = (s) => String(s ?? '').trim();

export function todayISO(d = new Date()) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
}

export function defaults() {
  return {
    v: SCHEMA_VERSION,
    clubKey: OTHER,
    custom: { name: '', primary: '#000000', secondary: '#FFFFFF' },
    athlete: { name: '', birth: '', category: '', categoryAuto: false, height: '', weight: '', coach: '', period: '', objective: '' },
    sessions: [],
  };
}

/* ---------------- medidas do atleta (altura em cm, peso em kg) ----------------
 * Guardadas como texto, do jeito que o profissional digitou, para não atrapalhar a digitação
 * (ex.: "68," a caminho de "68,5"). A leitura aceita vírgula ou ponto como separador decimal,
 * sem depender das configurações regionais do navegador. Campo vazio ou inválido não sai no PDF.
 */
const MEASURE_RANGE = { height: [50, 250], weight: [10, 250] };

/** Número positivo a partir do texto digitado ("68,5", "68.5", "175 cm"); null se vazio ou inválido. */
export function parseMeasure(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  const s = String(v ?? '').trim().toLowerCase().replace(/\s+/g, '').replace(/(cm|kg|m)$/, '');
  if (!/^\d{1,4}([.,]\d+)?$/.test(s)) return null;
  const n = Number(s.replace(',', '.'));
  return n > 0 ? n : null;
}

/** Número no padrão brasileiro, com até 2 casas e sem zeros à direita: 68.5 → "68,5", 175 → "175". */
export function fmtNum(n) {
  const [i, d] = (Math.round(n * 100) / 100).toFixed(2).split('.');
  const dec = d.replace(/0+$/, '');
  return dec ? `${i},${dec}` : i;
}

export const heightText = (v) => { const n = parseMeasure(v); return n === null ? '' : `${fmtNum(n)} cm`; };
export const weightText = (v) => { const n = parseMeasure(v); return n === null ? '' : `${fmtNum(n)} kg`; };

/** Aviso para o formulário ('' quando o valor está vazio ou plausível). Não bloqueia nada. */
export function measureHint(kind, v) {
  if (!trim(v)) return '';
  const n = parseMeasure(v);
  if (n === null) return 'Valor não reconhecido: use só números, com vírgula ou ponto para decimais. Ele não sai no PDF.';
  const [lo, hi] = MEASURE_RANGE[kind];
  if (n >= lo && n <= hi) return '';
  return kind === 'height'
    ? 'Confira o valor: a altura é informada em centímetros (ex.: 175).'
    : 'Confira o valor: o peso é informado em quilogramas (ex.: 68,5).';
}

export const newExercise = () => ({ id: uid(), name: '', sets: '', load: '', transfer: '', tvol: '' });

/* ---------------- datas ---------------- */
export function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d, wd: new Date(Date.UTC(y, mo - 1, d)).getUTCDay() };
}
export function isoAddDays(s, n) {
  const p = parseISO(s);
  if (!p) return '';
  return new Date(Date.UTC(p.y, p.m - 1, p.d + n)).toISOString().slice(0, 10);
}
export const pad2 = (n) => String(n).padStart(2, '0');
export function brDate(s) {
  const p = parseISO(s);
  return p ? `${pad2(p.d)}/${pad2(p.m)}/${p.y}` : '';
}
const cmpDate = (a, b) => a.y - b.y || a.m - b.m || a.d - b.d;

export function newSession(sessions) {
  const last = sessions.map((s) => s.date).filter((d) => parseISO(d)).sort().pop();
  return { id: uid(), date: last ? isoAddDays(last, 7) : todayISO(), tags: [], context: '', focus: '', prep: [], exercises: [newExercise()] };
}

/* ---------------- migração e validação ---------------- */
const str = (v) => (typeof v === 'string' ? v : '');
/** Medida vinda de arquivo: aceita texto ou número; qualquer outro tipo vira vazio. */
const measureField = (v) => (typeof v === 'number' ? (Number.isFinite(v) && v > 0 ? fmtNum(v) : '') : str(v));
const hex6 = (h, fb) => {
  let x = String(h || '').trim();
  if (/^#[0-9a-f]{3}$/i.test(x)) x = `#${x.slice(1).split('').map((c) => c + c).join('')}`;
  return /^#[0-9a-f]{6}$/i.test(x) ? x.toUpperCase() : fb;
};

/**
 * Converte qualquer entrada (rascunho da versão 1, arquivo exportado v1 ou v2) para o esquema atual.
 * Campos desconhecidos são descartados; tipos inválidos voltam ao padrão.
 */
export function hydrate(raw) {
  const s = defaults();
  if (!raw || typeof raw !== 'object') return s;
  const c = raw.custom || {};
  s.custom = { name: str(c.name), primary: hex6(c.primary, '#000000'), secondary: hex6(c.secondary, '#FFFFFF') };
  s.clubKey = raw.clubKey === OTHER || CLUBS[raw.clubKey] ? raw.clubKey : OTHER;
  const a = raw.athlete || {};
  s.athlete = {
    name: str(a.name), birth: parseISO(a.birth) ? a.birth : '', category: str(a.category), categoryAuto: !!a.categoryAuto,
    height: measureField(a.height), weight: measureField(a.weight),
    coach: str(a.coach), period: str(a.period), objective: str(a.objective),
  };
  s.sessions = (Array.isArray(raw.sessions) ? raw.sessions : []).filter((x) => x && typeof x === 'object').map((x) => ({
    id: str(x.id) || uid(),
    date: parseISO(x.date) ? x.date : '',
    tags: Array.isArray(x.tags) ? x.tags.filter((t) => typeof t === 'string') : [],
    context: str(x.context),
    focus: str(x.focus),
    prep: (Array.isArray(x.prep) ? x.prep : []).filter(Boolean).map((p) => ({
      id: str(p.id) || uid(), type: PREP_TYPES.includes(p.type) ? p.type : 'Outro', text: str(p.text), vol: str(p.vol),
    })),
    exercises: (Array.isArray(x.exercises) ? x.exercises : []).filter(Boolean).map((e) => ({
      id: str(e.id) || uid(), name: str(e.name), sets: str(e.sets), load: str(e.load), transfer: str(e.transfer), tvol: str(e.tvol),
    })),
  }));
  return s;
}

/** Imagens embutidas no formato da versão 1 (data URLs dentro do estado). */
export function legacyImages(raw) {
  const out = { photo: null, crests: {} };
  if (!raw || typeof raw !== 'object') return out;
  const p = raw.athlete?.photo;
  if (typeof p === 'string' && p.startsWith('data:image/')) out.photo = p;
  const co = raw.crestOverride;
  if (co && typeof co === 'object') {
    for (const [k, v] of Object.entries(co)) if ((k === OTHER || CLUBS[k]) && typeof v === 'string' && v.startsWith('data:image/')) out.crests[k] = v;
  }
  return out;
}

/* ---------------- valores derivados ---------------- */
export function sortedSessions(sessions) {
  return sessions
    .map((s, i) => ({ s, i, p: parseISO(s.date) }))
    .sort((a, b) => (a.p ? 0 : 1) - (b.p ? 0 : 1) || (a.p && b.p ? cmpDate(a.p, b.p) : 0) || a.i - b.i)
    .map((x) => x.s);
}

export function autoPeriod(sessions) {
  const ds = sessions.map((s) => parseISO(s.date)).filter(Boolean).sort(cmpDate);
  if (!ds.length) return '';
  const f = ds[0];
  const l = ds[ds.length - 1];
  if (f.y === l.y && f.m === l.m) return `${MON_FULL[f.m - 1]} de ${f.y}`;
  if (f.y === l.y) return `${MON_FULL[f.m - 1]} a ${MON_FULL[l.m - 1].toLowerCase()} de ${f.y}`;
  return `${MON_FULL[f.m - 1]} de ${f.y} a ${MON_FULL[l.m - 1].toLowerCase()} de ${l.y}`;
}
export const periodOf = (s) => trim(s.athlete.period) || autoPeriod(s.sessions);

/** Categoria "Sub-X" pelo ano de nascimento e pelo ano do planejamento (Sub-11 em 2026 = nascidos em 2015). */
export function categoryFor(birth, sessions, now = new Date()) {
  const b = parseISO(birth);
  if (!b) return '';
  const first = sessions.map((s) => parseISO(s.date)).filter(Boolean).sort(cmpDate)[0];
  const age = (first ? first.y : now.getFullYear()) - b.y;
  if (age < 4 || age > 40) return '';
  return age >= 21 ? 'Profissional' : `Sub-${age}`;
}

export function initials(n) {
  const p = trim(n).split(/\s+/).filter(Boolean);
  return p.length ? (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() : '';
}

/**
 * Identidade do clube atual.
 * @param {object} s estado
 * @param {Record<string, boolean>} uploaded escudos enviados pelo usuário, por chave de clube
 * @returns {{key:string,name:string,primary:string,secondary:string,accent:string,crest:null|{kind:'image',ref:string}|{kind:'mono',text:string}, official:boolean}}
 */
export function clubInfo(s, uploaded = {}) {
  const k = s.clubKey;
  if (k === OTHER || !CLUBS[k]) {
    const p = hex6(s.custom.primary, '#000000');
    const sec = hex6(s.custom.secondary, '#FFFFFF');
    return { key: OTHER, name: trim(s.custom.name), primary: p, secondary: sec, accent: sec, crest: uploaded[OTHER] ? { kind: 'image', ref: `crest:${OTHER}` } : null, official: false };
  }
  const c = CLUBS[k];
  let crest = null;
  if (uploaded[k]) crest = { kind: 'image', ref: `crest:${k}` };
  else if (c.crest === 'png') crest = { kind: 'image', ref: `club:${k}` };
  else if (c.mono) crest = { kind: 'mono', text: c.mono };
  return { key: k, name: c.name, primary: c.primary, secondary: c.secondary, accent: c.accent || c.secondary, crest, official: c.crest === 'png' };
}

export function slug(s) {
  return trim(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') || 'Atleta';
}
export function pdfFileName(s, today = todayISO()) {
  const cat = trim(s.athlete.category);
  return `Planejamento_${slug(s.athlete.name)}${cat ? `_${slug(cat)}` : ''}_${today}.pdf`;
}

/* ---------------- exemplo (sessões de março e abril de 2026) ---------------- */
export function sample() {
  const P = (type, text, vol = '') => ({ type, text, vol });
  const E = (name, sets, transfer, tvol = '', load = '') => ({ name, sets, transfer, tvol, load });
  const S = (date, focus, tags, context, prep, exercises) => ({ date, focus, tags, context, prep, exercises });
  const mob = () => P('Mobilidade', 'Mobilidade de quadril e flexibilidade');
  return hydrate({
    clubKey: 'america',
    athlete: {
      name: 'Atleta Exemplo da Silva', birth: '2015-05-12', category: 'Sub-11', categoryAuto: true, height: '142', weight: '36,5', coach: 'Kelvin Vulpi de Paula', period: '',
      objective: 'Trabalhar as capacidades funcionais (estabilidade, mobilidade e flexibilidade), aprimorar a força estrutural e manter as capacidades físicas de aceleração, reatividade, estabilidade e coordenação.',
    },
    sessions: [
      S('2026-03-02', 'Força e agilidade', [], '', [mob(), P('Ativação', 'Ativação neuromuscular')], [
        E('Stiff unipodal + agachamento (2)', '4-5-6', 'Aceleração reverse, contorno da baliza central + movimento em "V" com giro curto entre minicones nas diagonais, contorno da baliza central, captura de bola e retorno de costas.', '1-2-2'),
        E('Avanço + recuo (conjugado)', '4-5-6', 'Passada frontal curta com contorno e devolução; retorno + aceleração vertical, contorno no cone central + passada lateral entre cones (ida e volta) e devolução com a perna oposta.', '1-2-2'),
        E('Educativo de aterrissagem + salto vertical', '4-5-6', 'Movimento em "8" e devolução; retorno + giro completo entre cones, aceleração vertical, novo giro no cone central e devolução com a perna oposta.', '1-2-3')]),
      S('2026-03-09', 'Força e coordenação', [], '', [mob(), P('Ativação', 'Ativação com mini band'), P('Ativação neural', 'Comandos verbais, giro de quadril ao comando e bases anteroposteriores (frente e trás)')], [
        E('Flexão unilateral de quadril com carga + flexão unilateral sem carga + coordenativo + salto e queda bipodal', '3-4-5', 'Queda em profundidade (step), aceleração vertical, contorno em cones e devolução unilateral; retorno e giro curto em cones, saída ao centro + sprint.', '1-2-3'),
        E('Afundo reativo com flexão unilateral de quadril + agachamento concêntrico com retirada de carga do solo', '3-4-5', 'Domínio orientado e devolução longa/curta; contorno da baliza, saída ao centro e devolução a meia altura com a mesma perna; mesmo estímulo do lado oposto, aceleração na baliza da frente, TDD e aceleração diagonal.', '1-2-3')]),
      S('2026-03-16', 'Estabilidade e coordenação', ['Coordenativo'], '', [mob(), P('Ativação', 'Ativação com mini band'), P('Estabilidade', 'A) Toque lateral cruzado + coordenativo + flexão de joelho e ataque à parede. B) Flexão unilateral de quadril sobre tatame + skipping lateral')], [
        E('Stiff unipodal + coordenativo', '3×6', 'Passada lateral (ida e volta), saída e aceleração reverse, domínio orientado e devoluções longa/curta unilaterais.', '1-2-3'),
        E('Reatividade de tornozelo + flexão unilateral de quadril', '4-5-6', 'Skipping lateral, deslocamento lateral contornando o cone e devolução unilateral, TDD, novo contorno de cone + sprint.', '1-2-3')]),
      S('2026-03-23', 'Mobilidade e ativação', [], '', [mob(), P('Ativação', 'Ativação com mini band + neuromuscular'), P('Ativação neural', 'Skipping em posição simétrica com toques em pratos e aceleração na baliza de acordo com comandos verbais', '3×3')], [
        E('Agachamento', '10-11-12', 'Aceleração vertical e devoluções longa/curta, TDD no cone, contorno da baliza e captura de bola.', '1-2-3'),
        E('Troca de passes + aceleração vertical', '3×2', 'Contorno na baliza e domínio orientado com devoluções longa/curta unilaterais.')]),
      S('2026-03-30', 'Força e desaceleração', ['Força'], '', [P('Mobilidade', 'Mobilidade de quadril e core'), P('Ativação', 'Ativação com mini band + neuromuscular específica')], [
        E('Hip thrust', '10-11-12', 'Aceleração reverse, contorno no cone e deslocamento lateral, TDD e desaceleração no prato; mesmo estímulo no sentido oposto com tração de super band.', '2-3-3'),
        E('Agachamento + flexão de quadril + avanço em desaceleração no step', '10 / 4-5-6', 'Aceleração vertical, desaceleração na baliza, retorno e contorno do cone central, TDD na baliza e captura de bola; retorno à baliza e devoluções unilaterais + sprint.', '1-2-3')]),
      S('2026-04-06', 'Força e desaceleração', [], '', [P('Core', 'Core'), P('Ativação', 'Ativação com mini band'), P('Estabilidade', 'Recuo + flexão unilateral de quadril e devolução + aterrissagem lateral reativa em agachamento lateral', '2×6')], [
        E('Stiff bilateral + aterrissagem bipodal', '', 'Skipping lateral + salto unilateral retornando ao centro e novos estímulos do lado oposto, aceleração reverse, contorno da baliza e suicídio em 3 fases + devoluções unilaterais.', '1-2-3'),
        E('Levantamento unipodal + avanço', '4-5-6', 'Movimento em "V" com saída na baliza e devolução unilateral + aceleração e TDD no prato, contorno da baliza e devolução com a perna oposta.', '1-2-3')]),
      S('2026-04-13', 'Estabilidade e força unipodal', [], '', [P('Flexibilidade', 'Flexibilidade'), P('Ativação', 'Ativação com mini band'), P('Estabilidade', 'Flexão unilateral de quadril + empurrada horizontal com aquaball', '3×6')], [
        E('Step up', '6-7-8', 'Aceleração vertical, contorno na baliza e devoluções unilaterais, aceleração no prato inicial, TDD, novo contorno da baliza e captura de bola.', '1-2-3'),
        E('Afundo', '6-7-8', 'Giro completo nas balizas, saída ao centro e devolução unilateral; retorno + aceleração vertical, contorno do cone e aceleração retornando às balizas com devolução com a perna oposta.', '1-2-3')]),
      S('2026-04-20', 'Preventivos e estabilidade', ['Preventivo', 'Lúdico'], 'Atleta em disputa de campeonato, com jogo no mesmo dia da sessão. Necessária uma intervenção mais lúdica.', [P('Mobilidade', 'Mobilidade de tornozelo, quadril e flexibilidade'), P('Ativação', 'Ativação com mini band'), P('Core', 'Prancha com jogo da velha')], [
        E('Estabilidade unipodal com tração lateral de super band em dupla', '', 'Distribuição de cones durante a estabilização.'),
        E('Troca de passes + aceleração e deslocamento lateral entre cones', '', 'Desvio de pratos lançados.')]),
      S('2026-04-27', 'Força reativa e aceleração', ['Lúdico'], '', [mob(), P('Ativação', 'Ativação com mini band')], [
        E('Afundo reativo + wall drill', '3×6', 'Aceleração vertical, contorno na baliza, TDD no prato inicial, novo contorno na baliza e captura de bola.', '1-2-2'),
        E('Levantamento bipodal reativo + stiff (2)', '3-4-5', 'Queda em profundidade lateral, aceleração reverse, contorno na baliza e devolução unilateral; aceleração vertical, contorno no banco e devolução com a perna oposta.', '1-2-3'),
        E('Step up reativo + coordenação', '4-5-6', 'Aceleração vertical, giro completo em cones e saída ao centro; aceleração vertical, contorno na baliza e devoluções unilaterais + sprint.', '1-2-3')]),
    ],
  });
}
