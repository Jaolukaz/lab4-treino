/**
 * Formulário do planejamento: clube, atleta e construtor de sessões.
 * Marcação e comportamento herdados da versão web; no celular, as ações de cada sessão
 * saem do cabeçalho e viram uma barra com rótulos dentro da sessão aberta.
 */
import { BH_CLUBS, CATEGORIES, CLUBS, CONTEXT_QUICK, FOCUS_SUGGEST, MON, OTHER, PREP_QUICK, PREP_TYPES, TAGS, WD_FULL } from '../core/config.js';
import { autoPeriod, clubInfo, initials, measureHint, parseISO, trim } from '../core/model.js';
import { hexNorm, onColor } from '../core/theme.js';
import { CREST_URLS } from '../report/engine.js';
import { $, $$, ICON, esc } from './dom.js';

/** Escudo para as miniaturas do formulário: imagem ou monograma em SVG. */
export function crestHtml(ci, urls) {
  const cr = ci.crest;
  if (!cr) return '<span class="none">Sem escudo</span>';
  if (cr.kind === 'image') {
    const url = cr.ref.startsWith('club:') ? CREST_URLS[cr.ref.slice(5)] : urls.get(cr.ref);
    return url ? `<img src="${esc(url)}" alt="">` : '<span class="none">Sem escudo</span>';
  }
  const on = onColor(ci.primary, ci.secondary);
  const fs = cr.text.length > 2 ? 62 : 78;
  return `<svg viewBox="0 0 200 224" width="52" height="58" aria-hidden="true"><path d="M18 16L182 16L182 112Q182 184 100 212Q18 184 18 112Z" fill="${ci.primary}" stroke="${on}" stroke-width="9"/>`
    + `<text x="100" y="${110 + 0.35 * fs}" text-anchor="middle" font-family="Barlow Condensed" font-weight="800" font-size="${fs}" fill="${on}">${esc(cr.text)}</text></svg>`;
}

const uploadedOf = (imgs) => Object.fromEntries(Object.keys(imgs.crests || {}).map((k) => [k, true]));

function clubOptions(key) {
  const rest = Object.keys(CLUBS).filter((k) => !BH_CLUBS.includes(k)).sort((a, b) => CLUBS[a].name.localeCompare(CLUBS[b].name, 'pt-BR'));
  const opt = (k) => `<option value="${k}" ${key === k ? 'selected' : ''}>${esc(CLUBS[k].name)}</option>`;
  return `<optgroup label="Belo Horizonte">${BH_CLUBS.map(opt).join('')}</optgroup>
    <optgroup label="Série A 2026">${rest.map(opt).join('')}</optgroup>
    <optgroup label="Outros"><option value="${OTHER}" ${key === OTHER ? 'selected' : ''}>Outro / Sem clube</option></optgroup>`;
}

function clubPanel(app) {
  const { state, imgs } = app;
  const ci = clubInfo(state, uploadedOf(imgs));
  const isOther = ci.key === OTHER;
  const uploaded = !!imgs.crests[ci.key];
  return `<section class="panel" id="p-club">
    <h2 class="panel-h">Clube do atleta</h2>
    <div class="club-row">
      <div class="club-crest">${crestHtml(ci, app.urls)}</div>
      <div class="field"><label for="club-select">Clube</label><select id="club-select">${clubOptions(state.clubKey)}</select></div>
    </div>
    ${isOther ? `
      <div class="field" style="margin-top:14px"><label for="custom-name">Nome do clube <span class="opt">(opcional)</span></label>
        <input type="text" id="custom-name" data-scope="custom" data-f="name" value="${esc(state.custom.name)}" placeholder="Deixe em branco se o atleta não tem clube" autocomplete="off"></div>
      <div class="colors">
        <div><span class="lbl">Cor primária</span><label class="color-f"><input type="color" data-scope="custom" data-f="primary" value="${hexNorm(state.custom.primary).toLowerCase()}"><code>${hexNorm(state.custom.primary)}</code></label></div>
        <div><span class="lbl">Cor secundária</span><label class="color-f"><input type="color" data-scope="custom" data-f="secondary" value="${hexNorm(state.custom.secondary).toLowerCase()}"><code>${hexNorm(state.custom.secondary)}</code></label></div>
      </div>
      <div class="swatches"><button type="button" class="linkbtn" data-act="crest-up">${uploaded ? 'Trocar escudo' : 'Enviar escudo do clube'}</button>
        ${uploaded ? '<button type="button" class="linkbtn" data-act="crest-reset">Remover escudo</button>' : ''}</div>`
    : `
      <div class="swatches"><span class="sw" style="background:${ci.primary}"></span><span class="sw" style="background:${ci.secondary}"></span>
        <span>${ci.official || uploaded ? '' : 'Escudo provisório.'}</span>
        <button type="button" class="linkbtn" data-act="crest-up">${ci.official || uploaded ? 'Usar outro escudo' : 'Enviar escudo oficial'}</button>
        ${uploaded ? `<button type="button" class="linkbtn" data-act="crest-reset">${ci.official ? 'Restaurar escudo original' : 'Remover escudo enviado'}</button>` : ''}</div>`}
  </section>`;
}

export function avatarHtml(app) {
  const url = app.urls.get('photo');
  return url ? `<img src="${esc(url)}" alt="Foto do atleta">` : `<span>${esc(initials(app.state.athlete.name) || '?')}</span>`;
}

/**
 * Campo de medida opcional (altura em cm, peso em kg). Usa texto com teclado numérico do celular
 * (inputmode), em vez de type="number", para aceitar vírgula ou ponto em qualquer navegador e idioma.
 */
function measureField(kind, id, label, unit, value, mode, ph) {
  const hint = measureHint(kind, value);
  return `<div class="field"><label for="${id}">${label} <span class="opt">(${unit})</span></label>
        <input type="text" id="${id}" inputmode="${mode}" maxlength="8" data-scope="athlete" data-f="${kind}" value="${esc(value)}" placeholder="${ph}" autocomplete="off" aria-describedby="${id}-hint">
        <div class="hint warn" id="${id}-hint" aria-live="polite"${hint ? '' : ' hidden'}>${esc(hint)}</div></div>`;
}

/** Atualiza o aviso de um campo de medida sem redesenhar o formulário. */
export function updateMeasureHint(input) {
  const el = $(`#${input.id}-hint`);
  if (!el) return;
  const msg = measureHint(input.dataset.f, input.value);
  el.textContent = msg;
  el.hidden = !msg;
}

function athletePanel(app) {
  const a = app.state.athlete;
  const has = !!app.imgs.photo;
  return `<section class="panel" id="p-athlete">
    <h2 class="panel-h">Atleta</h2>
    <div class="field"><label for="a-name">Nome do atleta</label>
      <input type="text" id="a-name" class="name-input" data-scope="athlete" data-f="name" value="${esc(a.name)}" placeholder="Nome completo" autocomplete="off" autocapitalize="words"></div>
    <div class="row2">
      <div class="field"><label for="a-birth">Nascimento</label><input type="date" id="a-birth" data-scope="athlete" data-f="birth" value="${esc(a.birth)}"></div>
      <div class="field"><label for="a-cat">Categoria</label><input type="text" id="a-cat" list="dl-cat" data-scope="athlete" data-f="category" value="${esc(a.category)}" placeholder="Ex.: Sub-11" autocomplete="off"></div>
    </div>
    <div class="row2">
      ${measureField('height', 'a-height', 'Altura', 'cm', a.height, 'numeric', 'Ex.: 175')}
      ${measureField('weight', 'a-weight', 'Peso', 'kg', a.weight, 'decimal', 'Ex.: 68,5')}
    </div>
    <div class="field"><span class="lbl">Foto de perfil</span>
      <div class="photo-f">
        <div class="avatar" id="avatar">${avatarHtml(app)}</div>
        <div class="photo-actions">
          <div class="photo-src">
            <button type="button" class="btn btn-line btn-sm" data-act="photo-gallery">${ICON.gallery}${has ? 'Trocar foto' : 'Galeria'}</button>
            <button type="button" class="btn btn-line btn-sm touch-cam" data-act="photo-camera">${ICON.cam}Câmera</button>
          </div>
          ${has ? '<button type="button" class="linkbtn" data-act="photo-rm">Remover foto</button>' : '<span class="hint" style="margin:0">A imagem é recortada em quadrado e fica salva apenas neste aparelho.</span>'}
        </div>
      </div></div>
    <div class="row2">
      <div class="field"><label for="a-coach">Professor responsável</label><input type="text" id="a-coach" data-scope="athlete" data-f="coach" value="${esc(a.coach)}" placeholder="Ex.: Kelvin Vulpi de Paula" autocomplete="off" autocapitalize="words"></div>
      <div class="field"><label for="a-period">Período do planejamento</label><input type="text" id="a-period" data-scope="athlete" data-f="period" value="${esc(a.period)}" placeholder="${esc(autoPeriod(app.state.sessions) || 'Ex.: Março a abril de 2026')}" autocomplete="off"></div>
    </div>
    <div class="field"><label for="a-obj">Objetivo geral</label>
      <textarea id="a-obj" data-scope="athlete" data-f="objective" rows="3" placeholder="Foco longitudinal do atleta neste ciclo">${esc(a.objective)}</textarea></div>
  </section>`;
}

export function seSummary(s) {
  const p = parseISO(s.date);
  const n = s.exercises.length;
  const parts = [p ? WD_FULL[p.wd] : 'Sem data', n === 1 ? '1 exercício' : `${n} exercícios`];
  if (s.tags.length) parts.push(s.tags.join(', '));
  return {
    date: p ? `<b>${String(p.d).padStart(2, '0')}</b><span>${MON[p.m - 1]}</span>` : '<b>–</b><span>data</span>',
    title: trim(s.focus) ? `<div class="se-title">${esc(s.focus)}</div>` : '<div class="se-title empty">Defina o foco da sessão</div>',
    meta: esc(parts.join('  |  ')),
  };
}

function sessionHtml(app, s, i, total) {
  const open = app.ui.open.has(s.id);
  const sm = seSummary(s);
  return `<article class="se${open ? ' open' : ''}" data-sid="${s.id}">
    <div class="se-h" data-act="toggle" role="button" tabindex="0" aria-expanded="${open}">
      <div class="se-date">${sm.date}</div>
      <div class="se-sum">${sm.title}<div class="se-meta">${sm.meta}</div></div>
      <div class="se-tools">
        <button type="button" class="ib" data-act="s-up" title="Mover para cima" aria-label="Mover sessão para cima" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button>
        <button type="button" class="ib" data-act="s-down" title="Mover para baixo" aria-label="Mover sessão para baixo" ${i === total - 1 ? 'disabled' : ''}>${ICON.down}</button>
        <button type="button" class="ib" data-act="s-dup" title="Duplicar sessão (próxima semana)" aria-label="Duplicar sessão">${ICON.copy}</button>
        <button type="button" class="ib danger" data-act="s-del" title="Excluir sessão" aria-label="Excluir sessão">${ICON.trash}</button>
        <span class="ib chev" aria-hidden="true">${ICON.chev}</span>
      </div>
    </div>
    ${open ? sessionBody(s, i, total) : ''}
  </article>`;
}

function sessionBody(s, i, total) {
  return `<div class="se-b">
    <div class="se-bar">
      <button type="button" class="btn btn-line btn-sm" data-act="s-up" ${i === 0 ? 'disabled' : ''}>${ICON.up}Subir</button>
      <button type="button" class="btn btn-line btn-sm" data-act="s-down" ${i === total - 1 ? 'disabled' : ''}>${ICON.down}Descer</button>
      <button type="button" class="btn btn-line btn-sm" data-act="s-dup">${ICON.copy}Duplicar</button>
      <button type="button" class="btn btn-line btn-sm" data-act="s-del">${ICON.trash}Excluir</button>
    </div>
    <div class="row2" style="margin-top:14px">
      <div class="field"><label>Data da sessão</label><input type="date" data-scope="session" data-f="date" value="${esc(s.date)}"></div>
      <div class="field"><label>Método / foco principal</label><input type="text" list="dl-focus" data-scope="session" data-f="focus" value="${esc(s.focus)}" placeholder="Ex.: Força e agilidade" autocomplete="off"></div>
    </div>
    <div class="field"><span class="lbl">Característica da sessão</span>
      <div class="chips">${TAGS.map((t) => `<button type="button" class="chip" data-act="tag" data-tag="${esc(t)}" aria-pressed="${s.tags.includes(t)}">${esc(t)}</button>`).join('')}</div></div>
    <div class="field"><label>Contexto pré-sessão <span class="opt">(aparece em destaque se preenchido)</span></label>
      <textarea data-scope="session" data-f="context" rows="2" placeholder="Ex.: Atleta em disputa de campeonato, com jogo no mesmo dia">${esc(s.context)}</textarea>
      <div class="chips" style="margin-top:7px">${CONTEXT_QUICK.map((t) => `<button type="button" class="chip add" data-act="ctx-add" data-text="${esc(t)}">+ ${esc(t)}</button>`).join('')}</div></div>

    <h4 class="sub-h">Fase de preparação</h4>
    ${s.prep.length ? '' : '<p class="empty-note">Mobilidade, ativação, core. Use os atalhos abaixo ou adicione um item livre.</p>'}
    <div class="prep-list">${s.prep.map(prepHtml).join('')}</div>
    <div class="chips">${PREP_QUICK.map((q, k) => `<button type="button" class="chip add" data-act="prep-quick" data-k="${k}">+ ${esc(q[1] || q[0])}</button>`).join('')}
      <button type="button" class="chip add" data-act="prep-add">+ Item livre</button></div>

    <h4 class="sub-h">${ICON.ball}Desenvolvimento: exercícios principais</h4>
    ${s.exercises.length ? '' : '<p class="empty-note">Cada exercício liga o gesto de força ao gesto do jogo na transferência.</p>'}
    <div class="ex-list-ed">${s.exercises.map((e, k) => exerciseHtml(e, k, s.exercises.length)).join('')}</div>
    <button type="button" class="btn-add btn-add-sm" data-act="ex-add">${ICON.plus}Adicionar exercício</button>
  </div>`;
}

function prepHtml(p) {
  return `<div class="prep-item" data-pid="${p.id}">
    <select data-scope="prep" data-f="type" aria-label="Tipo">${PREP_TYPES.map((t) => `<option ${p.type === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
    <textarea rows="1" data-scope="prep" data-f="text" placeholder="Descrição" aria-label="Descrição">${esc(p.text)}</textarea>
    <input type="text" data-scope="prep" data-f="vol" value="${esc(p.vol)}" placeholder="Volume" aria-label="Volume" autocomplete="off">
    <button type="button" class="ib danger" data-act="prep-del" title="Remover item" aria-label="Remover item">${ICON.x}</button>
  </div>`;
}

function exerciseHtml(e, k, n) {
  return `<div class="ex" data-eid="${e.id}">
    <div class="ex-top"><span class="ex-idx">${k + 1}</span><span class="lbl">Exercício</span>
      <button type="button" class="ib" data-act="e-up" title="Mover para cima" aria-label="Mover exercício para cima" ${k === 0 ? 'disabled' : ''}>${ICON.up}</button>
      <button type="button" class="ib" data-act="e-down" title="Mover para baixo" aria-label="Mover exercício para baixo" ${k === n - 1 ? 'disabled' : ''}>${ICON.down}</button>
      <button type="button" class="ib" data-act="e-dup" title="Duplicar exercício" aria-label="Duplicar exercício">${ICON.copy}</button>
      <button type="button" class="ib danger" data-act="e-del" title="Excluir exercício" aria-label="Excluir exercício">${ICON.trash}</button></div>
    <div class="field"><textarea rows="1" data-scope="ex" data-f="name" placeholder="Ex.: Stiff unipodal + agachamento" aria-label="Nome do exercício" style="min-height:44px">${esc(e.name)}</textarea></div>
    <div class="row2">
      <div class="field"><label>Séries / repetições</label><input type="text" data-scope="ex" data-f="sets" value="${esc(e.sets)}" placeholder="Ex.: 4-5-6 ou 3×6" autocomplete="off"></div>
      <div class="field"><label>Carga ou tempo <span class="opt">(opcional)</span></label><input type="text" data-scope="ex" data-f="load" value="${esc(e.load)}" placeholder="Ex.: 8 kg, 30 s" autocomplete="off"></div>
    </div>
    <div class="tr-box">
      <label>${ICON.ball}Transferência para o futebol</label>
      <div class="tr-grid">
        <textarea rows="2" data-scope="ex" data-f="transfer" placeholder="Gesto esportivo: aceleração reverse, contorno de baliza, captura de bola…" aria-label="Transferência para o futebol">${esc(e.transfer)}</textarea>
        <div class="mini"><label>Volume</label><input type="text" data-scope="ex" data-f="tvol" value="${esc(e.tvol)}" placeholder="Ex.: 1-2-2" aria-label="Volume da transferência" autocomplete="off"></div>
      </div>
    </div>
  </div>`;
}

function sessionsPanel(app) {
  const list = app.state.sessions;
  const n = list.length;
  return `<section class="panel" id="p-sessions">
    <h2 class="panel-h">Sessões <span class="count">${n ? (n === 1 ? '1 sessão' : `${n} sessões`) : ''}</span></h2>
    ${n ? '' : '<p class="empty-note">Monte cada sessão com data, foco, preparação e exercícios. No relatório elas aparecem em ordem de data.</p>'}
    <div id="sessions">${list.map((s, i) => sessionHtml(app, s, i, n)).join('')}</div>
    <button type="button" class="btn-add" data-act="s-add">${ICON.plus}Adicionar sessão</button>
  </section>`;
}

const isBlank = (s) => !s.athlete.name && !s.athlete.objective && !s.athlete.coach && !s.sessions.length;

export function autoGrow(t) { t.style.height = 'auto'; t.style.height = `${t.scrollHeight + 3}px`; }
const growAll = (root) => requestAnimationFrame(() => $$('textarea', root).forEach(autoGrow));

export function renderEditor(app) {
  const ed = $('#editor');
  const y = ed.scrollTop;
  ed.innerHTML = `
    ${isBlank(app.state) ? `<div class="intro"><p>Comece pelo clube e pelos dados do atleta. Para ver como o relatório fica, carregue um planejamento de exemplo.</p>
      <button type="button" class="btn btn-line btn-sm" data-act="sample">Carregar exemplo</button></div>` : ''}
    ${clubPanel(app)}${athletePanel(app)}${sessionsPanel(app)}
    <datalist id="dl-cat">${CATEGORIES.map((c) => `<option value="${c}">`).join('')}</datalist>
    <datalist id="dl-focus">${FOCUS_SUGGEST.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`;
  growAll(ed);
  ed.scrollTop = y;
}

export function rerenderClub(app) {
  const el = $('#p-club');
  if (el) el.outerHTML = clubPanel(app); else renderEditor(app);
}
export function rerenderAthletePhoto(app) {
  const el = $('#p-athlete');
  if (!el) return;
  el.outerHTML = athletePanel(app);
  growAll($('#p-athlete'));
}
export function rerenderSessions(app) {
  const box = $('#p-sessions');
  if (!box) { renderEditor(app); return; }
  box.outerHTML = sessionsPanel(app);
  growAll($('#p-sessions'));
}
export function rerenderSession(app, sid) {
  const el = $(`.se[data-sid="${sid}"]`);
  const i = app.state.sessions.findIndex((s) => s.id === sid);
  if (!el || i < 0) { rerenderSessions(app); return; }
  el.outerHTML = sessionHtml(app, app.state.sessions[i], i, app.state.sessions.length);
  growAll($(`.se[data-sid="${sid}"]`));
}
export function updateSeHeader(s) {
  const el = $(`.se[data-sid="${s.id}"]`);
  if (!el) return;
  const sm = seSummary(s);
  $('.se-date', el).innerHTML = sm.date;
  $('.se-sum', el).innerHTML = `${sm.title}<div class="se-meta">${sm.meta}</div>`;
}
