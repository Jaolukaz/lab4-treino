/**
 * Controlador da aplicação: mantém o planejamento em edição, liga o formulário ao estado,
 * salva automaticamente no IndexedDB e executa os comandos (PDF, planejamentos, exportar, importar).
 */
import { APP_VERSION, CONTEXT_QUICK, PREP_QUICK, TAGS } from './core/config.js';
import { autoPeriod, brDate, categoryFor, clubInfo, defaults, fmtNum, isoAddDays, newExercise, newSession, parseMeasure, sample, slug, todayISO, trim, uid } from './core/model.js';
import { themeOf } from './core/theme.js';
import * as repo from './storage/repo.js';
import { $, $$, ICON, debounce, esc, isTouch } from './ui/dom.js';
import { ask, busy, toast } from './ui/feedback.js';
import { autoGrow, avatarHtml, renderEditor, rerenderAthletePhoto, rerenderClub, rerenderSession, rerenderSessions, updateMeasureHint, updateSeHeader } from './ui/editor.js';
import { ImageUrls, processCrest, processPhoto } from './ui/photos.js';
import { deliver } from './ui/share.js';
import { initPwa, promptInstall, requestPersistence } from './ui/pwa.js';
import { CREST_URLS, LOGO_URLS, buildPdf, computeLayout, getEngine, layoutToSvg } from './report/engine.js';

const app = {
  id: null,
  createdAt: null,
  state: defaults(),
  imgs: repo.emptyImages(),
  urls: new ImageUrls(),
  ui: { open: new Set() },
  storageKind: 'idb',
  mode: 'edit',
};
const wide = matchMedia('(min-width: 981px)');

/* ============================================================
   Persistência
   ============================================================ */
function setSaveState(msg, warn = false) {
  $$('[data-save-state]').forEach((el) => { el.textContent = msg; el.classList.toggle('warn', warn); });
}

async function saveNow() {
  try {
    await repo.savePlan(app.id, app.state, app.createdAt);
    const t = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    setSaveState(app.storageKind === 'memory' ? 'Sem salvamento local' : `Salvo às ${t}`, app.storageKind === 'memory');
  } catch (err) {
    console.error(err);
    setSaveState('Falha ao salvar', true);
    toast('Não foi possível salvar no aparelho. Use "Exportar" para não perder o planejamento.', 8000);
  }
}
const scheduleSave = debounce(saveNow, 500);
const flushPending = async () => { if (scheduleSave.pending()) await scheduleSave.flush(); };

async function saveImagesNow() {
  try { await repo.saveImages(app.id, app.imgs); requestPersistence(); } catch (err) {
    console.error(err);
    toast('Não foi possível salvar a imagem no aparelho.', 6000);
  }
}

async function openPlan(id) {
  const rec = await repo.loadPlan(id);
  if (!rec) return false;
  app.id = rec.id;
  app.createdAt = rec.createdAt;
  app.state = rec.state;
  app.imgs = await repo.loadImages(id);
  app.urls.reset(app.imgs);
  app.ui.open.clear();
  await repo.setCurrentId(id);
  applyTheme();
  renderEditor(app);
  scheduleRender();
  return true;
}

/* ============================================================
   Tema do clube na interface
   ============================================================ */
const uploaded = () => Object.fromEntries(Object.keys(app.imgs.crests).map((k) => [k, true]));
function applyTheme() {
  const T = themeOf(clubInfo(app.state, uploaded()));
  const r = document.documentElement.style;
  [['--c1', T.c1], ['--on1', T.on1], ['--c1ink', T.c1ink], ['--c1t', T.c1t], ['--c1t2', T.c1t2], ['--c1l', T.c1l], ['--stripe', T.stripe]]
    .forEach(([k, v]) => r.setProperty(k, v));
}

/* ============================================================
   Pré-visualização A4 (mesma lista de desenho do PDF)
   ============================================================ */
const previewVisible = () => wide.matches || app.mode === 'preview';
const urlFor = (ref) => {
  if (LOGO_URLS[ref]) return LOGO_URLS[ref];
  if (ref.startsWith('club:')) return CREST_URLS[ref.slice(5)] || null;
  return app.urls.get(ref);
};

async function renderPreview() {
  if (!previewVisible()) return;
  try {
    const layout = await computeLayout(app.state, app.imgs);
    $('#report').innerHTML = layoutToSvg(layout, urlFor).map((svg) => `<div class="a4">${svg}</div>`).join('');
    const n = layout.pages.length;
    $('#page-count').textContent = n === 1 ? '1 página' : `${n} páginas`;
    const ov = layout.overflowPages;
    const msg = $('#ovf-msg');
    msg.hidden = !ov.length;
    if (ov.length) msg.textContent = `Um exercício ou bloco é maior que a área útil da folha na página ${ov.join(', ')}. Divida o texto em mais de um exercício.`;
  } catch (err) {
    console.error(err);
    $('#report').innerHTML = '<p class="loading">Não foi possível montar a pré-visualização. Recarregue a página e tente novamente.</p>';
  }
}
const scheduleRender = debounce(renderPreview, 250);

function setMode(mode) {
  app.mode = mode;
  document.body.classList.toggle('v-edit', mode === 'edit');
  document.body.classList.toggle('v-prev', mode === 'preview');
  $$('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  if (mode === 'preview') {
    if (!$('#report svg')) $('#report').innerHTML = '<p class="loading">Montando páginas…</p>';
    scheduleRender.flush() ?? renderPreview();
  }
  if (!wide.matches) window.scrollTo({ top: 0 });
}

function touch() { scheduleSave(); scheduleRender(); }

/* ============================================================
   Formulário
   ============================================================ */
const findS = (el) => { const c = el.closest('[data-sid]'); return c ? app.state.sessions.find((s) => s.id === c.dataset.sid) : null; };

function autoCategory() {
  const a = app.state.athlete;
  if (a.category && !a.categoryAuto) return;
  const cat = categoryFor(a.birth, app.state.sessions);
  if (!cat) return;
  a.category = cat;
  a.categoryAuto = true;
  const inp = $('#a-cat');
  if (inp) inp.value = cat;
}

function onInput(ev) {
  const t = ev.target;
  const { scope } = t.dataset;
  if (!scope) return;
  const f = t.dataset.f;
  const v = t.value;
  if (t.tagName === 'TEXTAREA') autoGrow(t);
  const { state } = app;
  if (scope === 'athlete') {
    state.athlete[f] = v;
    if (f === 'category') state.athlete.categoryAuto = false;
    if (f === 'birth') autoCategory();
    if (f === 'name' && !app.imgs.photo) { const av = $('#avatar'); if (av) av.innerHTML = avatarHtml(app); }
    if (f === 'height' || f === 'weight') updateMeasureHint(t);
  } else if (scope === 'custom') {
    state.custom[f] = v;
    if (t.type === 'color') { const c = t.parentElement.querySelector('code'); if (c) c.textContent = v.toUpperCase(); }
    applyTheme();
  } else {
    const s = findS(t);
    if (!s) return;
    if (scope === 'session') {
      s[f] = v;
      if (f === 'date' || f === 'focus') updateSeHeader(s);
      if (f === 'date') { autoCategory(); const p = $('#a-period'); if (p) p.placeholder = periodPlaceholder(); }
    } else if (scope === 'prep') {
      const p = s.prep.find((x) => x.id === t.closest('[data-pid]').dataset.pid);
      if (p) p[f] = v;
    } else if (scope === 'ex') {
      const e = s.exercises.find((x) => x.id === t.closest('[data-eid]').dataset.eid);
      if (e) e[f] = v;
    }
  }
  touch();
}
const periodPlaceholder = () => autoPeriod(app.state.sessions) || 'Ex.: Março a abril de 2026';

const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
const focusLater = (sel) => requestAnimationFrame(() => { const el = $(sel); if (el) el.focus({ preventScroll: false }); });

function scrollToSession(id) {
  const el = $(`.se[data-sid="${id}"]`);
  if (!el) return;
  const ed = $('#editor');
  if (wide.matches) ed.scrollTo({ top: el.getBoundingClientRect().top - ed.getBoundingClientRect().top + ed.scrollTop - 14, behavior: 'smooth' });
  else el.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

const confirmDelete = (title, text) => ask(title, `<p>${esc(text)}</p>`, [{ label: 'Cancelar', value: null }, { label: 'Excluir', value: 'del', cls: 'btn-danger-solid' }]).then((r) => r === 'del');

async function onEditorClick(ev) {
  const b = ev.target.closest('[data-act]');
  if (!b) return;
  const { act } = b.dataset;
  const { state } = app;
  const s = findS(b);
  const si = s ? state.sessions.indexOf(s) : -1;
  switch (act) {
    case 'toggle':
      if (ev.target.closest('.se-tools button')) return;
      if (app.ui.open.has(s.id)) app.ui.open.delete(s.id); else app.ui.open.add(s.id);
      rerenderSession(app, s.id);
      return;
    case 's-add': {
      const n = newSession(state.sessions);
      state.sessions.push(n);
      app.ui.open.add(n.id);
      rerenderSessions(app);
      requestAnimationFrame(() => scrollToSession(n.id));
      break;
    }
    case 's-up': move(state.sessions, si, -1); rerenderSessions(app); requestAnimationFrame(() => scrollToSession(s.id)); break;
    case 's-down': move(state.sessions, si, 1); rerenderSessions(app); requestAnimationFrame(() => scrollToSession(s.id)); break;
    case 's-dup': {
      const c = JSON.parse(JSON.stringify(s));
      c.id = uid();
      c.date = s.date ? isoAddDays(s.date, 7) : '';
      c.prep.forEach((p) => { p.id = uid(); });
      c.exercises.forEach((e) => { e.id = uid(); });
      state.sessions.splice(si + 1, 0, c);
      app.ui.open.add(c.id);
      rerenderSessions(app);
      requestAnimationFrame(() => scrollToSession(c.id));
      toast('Sessão duplicada para a semana seguinte.');
      break;
    }
    case 's-del': {
      const ok = await confirmDelete('Excluir sessão', `${trim(s.focus) || 'A sessão'}${s.date ? ` de ${brDate(s.date)}` : ''} e todos os seus exercícios serão removidos.`);
      if (!ok) return;
      state.sessions.splice(state.sessions.indexOf(s), 1);
      app.ui.open.delete(s.id);
      rerenderSessions(app);
      break;
    }
    case 'tag': {
      const t = b.dataset.tag;
      const k = s.tags.indexOf(t);
      if (k >= 0) s.tags.splice(k, 1); else s.tags.push(t);
      s.tags.sort((x, y) => TAGS.indexOf(x) - TAGS.indexOf(y));
      b.setAttribute('aria-pressed', String(s.tags.includes(t)));
      updateSeHeader(s);
      break;
    }
    case 'ctx-add': {
      const t = b.dataset.text;
      if (!CONTEXT_QUICK.includes(t)) return;
      const cur = trim(s.context);
      s.context = cur ? `${cur.replace(/[.;,]?$/, '')}. ${t}.` : `${t}.`;
      const ta = $(`.se[data-sid="${s.id}"] textarea[data-f="context"]`);
      if (ta) { ta.value = s.context; autoGrow(ta); }
      break;
    }
    case 'prep-quick': {
      const q = PREP_QUICK[+b.dataset.k];
      const p = { id: uid(), type: q[0], text: q[1], vol: '' };
      s.prep.push(p);
      rerenderSession(app, s.id);
      if (!q[1]) focusLater(`[data-pid="${p.id}"] textarea`);
      break;
    }
    case 'prep-add': {
      const p = { id: uid(), type: 'Outro', text: '', vol: '' };
      s.prep.push(p);
      rerenderSession(app, s.id);
      focusLater(`[data-pid="${p.id}"] textarea`);
      break;
    }
    case 'prep-del': {
      const id = b.closest('[data-pid]').dataset.pid;
      s.prep = s.prep.filter((p) => p.id !== id);
      rerenderSession(app, s.id);
      break;
    }
    case 'ex-add': {
      const e = newExercise();
      s.exercises.push(e);
      rerenderSession(app, s.id);
      focusLater(`[data-eid="${e.id}"] textarea`);
      break;
    }
    case 'e-up': case 'e-down': case 'e-dup': case 'e-del': {
      const id = b.closest('[data-eid]').dataset.eid;
      const k = s.exercises.findIndex((e) => e.id === id);
      if (act === 'e-up') move(s.exercises, k, -1);
      if (act === 'e-down') move(s.exercises, k, 1);
      if (act === 'e-dup') s.exercises.splice(k + 1, 0, { ...s.exercises[k], id: uid() });
      if (act === 'e-del') {
        const e = s.exercises[k];
        if ((trim(e.name) || trim(e.transfer)) && !(await confirmDelete('Excluir exercício', `${trim(e.name) || 'O exercício'} será removido da sessão.`))) return;
        s.exercises.splice(k, 1);
      }
      rerenderSession(app, s.id);
      break;
    }
    case 'photo-gallery': $('#file-photo').click(); return;
    case 'photo-camera': $('#file-camera').click(); return;
    case 'photo-rm':
      app.imgs.photo = null;
      app.urls.revoke('photo');
      rerenderAthletePhoto(app);
      saveImagesNow();
      break;
    case 'crest-up': $('#file-crest').click(); return;
    case 'crest-reset':
      delete app.imgs.crests[state.clubKey];
      app.urls.revoke(`crest:${state.clubKey}`);
      rerenderClub(app);
      applyTheme();
      saveImagesNow();
      break;
    case 'sample':
      app.state = sample();
      app.ui.open.clear();
      app.ui.open.add(app.state.sessions[0].id);
      applyTheme();
      renderEditor(app);
      toast('Exemplo carregado.');
      break;
    default: return;
  }
  touch();
}

async function setPhoto(file) {
  if (!file) return;
  const av = $('#avatar');
  av?.classList.add('busy');
  try {
    const rec = await processPhoto(file);
    app.imgs.photo = rec;
    app.urls.set('photo', rec);
    rerenderAthletePhoto(app);
    await saveImagesNow();
    touch();
  } catch (err) {
    console.error(err);
    toast('Não foi possível ler esta imagem. Tente outra foto ou um arquivo JPG ou PNG.', 6000);
  } finally {
    $('#avatar')?.classList.remove('busy');
  }
}

async function setCrest(file) {
  if (!file) return;
  try {
    const rec = await processCrest(file);
    const k = app.state.clubKey;
    app.imgs.crests[k] = rec;
    app.urls.set(`crest:${k}`, rec);
    rerenderClub(app);
    applyTheme();
    await saveImagesNow();
    touch();
  } catch (err) {
    console.error(err);
    toast('Não foi possível ler esta imagem. Use um arquivo PNG ou JPG.', 6000);
  }
}

function bindEditor() {
  const ed = $('#editor');
  ed.addEventListener('input', onInput);
  ed.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'club-select') {
      app.state.clubKey = t.value;
      applyTheme();
      rerenderClub(app);
      touch();
    } else if (t.dataset.scope && (t.tagName === 'SELECT' || t.type === 'date')) onInput(ev);
    else if (t.dataset.scope === 'athlete' && (t.dataset.f === 'height' || t.dataset.f === 'weight')) {
      // Ao sair do campo, mostra o valor no formato que vai para o PDF ("68.5" → "68,5", "175 cm" → "175").
      const n = parseMeasure(t.value);
      if (n !== null && fmtNum(n) !== t.value) {
        t.value = fmtNum(n);
        onInput(ev);
      }
    }
  });
  ed.addEventListener('click', onEditorClick);
  ed.addEventListener('keydown', (ev) => {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('.se-h')) { ev.preventDefault(); onEditorClick(ev); }
  });
  const pick = (id, fn) => $(id).addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; fn(f); });
  pick('#file-photo', setPhoto);
  pick('#file-camera', setPhoto);
  pick('#file-crest', setCrest);
}

/* ============================================================
   Comandos
   ============================================================ */
async function cmdPdf() {
  await flushPending();
  busy(true, 'Preparando o relatório…');
  let layout;
  try {
    layout = await computeLayout(app.state, app.imgs);
  } catch (err) {
    busy(false);
    console.error(err);
    toast('Não foi possível carregar o gerador de PDF. Verifique a conexão na primeira abertura e tente novamente.', 7000);
    return;
  }
  busy(false);
  const issues = [];
  if (!trim(app.state.athlete.name)) issues.push('O nome do atleta não foi informado.');
  if (!app.state.sessions.length) issues.push('Nenhuma sessão foi adicionada: o relatório terá apenas a capa, o objetivo e os dados do atleta.');
  if (layout.overflowPages.length) issues.push(`Há conteúdo maior que a área útil da folha na página ${layout.overflowPages.join(', ')}.`);
  if (issues.length) {
    const r = await ask('Revise antes de gerar',
      `<p>Encontramos pontos que podem deixar o PDF incompleto:</p><ul>${issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`,
      [{ label: 'Voltar e corrigir', value: 'back' }, { label: 'Gerar mesmo assim', value: 'go', cls: 'btn-dark' }]);
    if (r !== 'go') return;
  }
  busy(true, 'Gerando PDF…');
  try {
    const { file } = await buildPdf(app.state, app.imgs);
    busy(false);
    const n = trim(app.state.athlete.name);
    await deliver(file, { kind: 'pdf', heading: 'PDF pronto', title: `Planejamento de treino Lab-4${n ? ` | ${n}` : ''}` });
  } catch (err) {
    busy(false);
    console.error(err);
    toast('Falha ao gerar o PDF. Tente novamente; se persistir, exporte o planejamento e envie ao suporte.', 7000);
  }
}

async function cmdExport() {
  await flushPending();
  const json = repo.buildExport(app.state, app.imgs);
  const file = new File([json], `Planejamento_${slug(app.state.athlete.name)}_${todayISO()}.json`, { type: 'application/json' });
  await deliver(file, {
    kind: 'json',
    heading: 'Cópia do planejamento',
    title: 'Planejamento Lab-4 (arquivo de dados)',
    note: '<p>Este arquivo guarda todos os campos, a foto e os escudos enviados. Use "Importar" em qualquer aparelho para reabri-lo. Ele também abre na versão de computador.</p>',
  });
}

async function cmdImport(file) {
  if (!file) return;
  busy(true, 'Importando…');
  try {
    await flushPending();
    const { id } = await repo.importPlan(await file.text());
    await openPlan(id);
    busy(false);
    setMode('edit');
    toast('Planejamento importado e aberto para edição.');
  } catch (err) {
    busy(false);
    toast(err.message || 'Não foi possível importar este arquivo.', 6000);
  }
}

async function cmdNew() {
  if ($('#plans').open) $('#plans').close();
  await flushPending();
  const { id } = await repo.createPlan();
  await openPlan(id);
  setMode('edit');
  $('#editor').scrollTop = 0;
  toast('Novo planejamento iniciado. O anterior continua salvo em "Planejamentos".');
}

const when = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

async function cmdPlans() {
  await flushPending();
  const list = await repo.listPlans();
  $('#plans-list').innerHTML = list.length
    ? list.map((p) => `
      <li class="ev ${p.id === app.id ? 'current' : ''}">
        <div class="ev-info"><b>${esc(p.name.trim() || 'Atleta sem nome')}</b>
          <span>${esc([p.category, p.sessions === 1 ? '1 sessão' : `${p.sessions} sessões`].filter(Boolean).join(', '))}. Editado em ${when(p.updatedAt)}</span>
          ${p.id === app.id ? '<em>Em edição</em>' : ''}</div>
        <div class="ev-act">
          ${p.id === app.id ? '' : `<button type="button" class="btn btn-line" data-plan-open="${p.id}">Abrir</button>`}
          <button type="button" class="icon-btn" data-plan-del="${p.id}" aria-label="Excluir planejamento de ${esc(p.name || 'atleta sem nome')}">${ICON.trash}</button>
        </div>
      </li>`).join('')
    : '<li class="list-empty">Nenhum planejamento salvo.</li>';
  $('#plans-count').textContent = `${list.length} ${list.length === 1 ? 'planejamento salvo' : 'planejamentos salvos'} neste aparelho`;
  if (!$('#plans').open) $('#plans').showModal();
}

async function cmdDelete(id) {
  const rec = await repo.loadPlan(id);
  const nome = rec?.state.athlete.name.trim() || 'atleta sem nome';
  $('#plans').close();
  const r = await ask('Excluir planejamento',
    `<p>O planejamento de <b>${esc(nome)}</b>, com a foto e os escudos enviados, será apagado deste aparelho. Essa ação não pode ser desfeita.</p><p>Se quiser guardar uma cópia, use "Exportar" antes.</p>`,
    [{ label: 'Cancelar', value: null }, { label: 'Excluir', value: 'del', cls: 'btn-danger-solid' }]);
  if (r !== 'del') { cmdPlans(); return; }
  await repo.deletePlan(id);
  if (id === app.id) {
    const rest = await repo.listPlans();
    if (rest.length) await openPlan(rest[0].id);
    else { const { id: nid } = await repo.createPlan(); await openPlan(nid); }
  }
  toast('Planejamento excluído.');
  cmdPlans();
}

function bindChrome() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode], [data-cmd], [data-plan-open], [data-plan-del]');
    if (!b || b.closest('#editor')) return;
    if (b.dataset.mode) { setMode(b.dataset.mode); return; }
    if (b.dataset.planOpen) {
      $('#plans').close();
      flushPending().then(() => openPlan(b.dataset.planOpen)).then(() => { setMode('edit'); toast('Planejamento aberto.'); });
      return;
    }
    if (b.dataset.planDel) { cmdDelete(b.dataset.planDel); return; }
    const { cmd } = b.dataset;
    if (b.closest('#menu')) $('#menu').close();
    if (cmd === 'pdf') cmdPdf();
    else if (cmd === 'export') cmdExport();
    else if (cmd === 'import') $('#file-json').click();
    else if (cmd === 'new') cmdNew();
    else if (cmd === 'plans') cmdPlans();
    else if (cmd === 'menu') $('#menu').showModal();
    else if (cmd === 'install') promptInstall();
    else if (cmd === 'close-plans') $('#plans').close();
  });
  $('#file-json').addEventListener('change', (e) => { cmdImport(e.target.files[0]); e.target.value = ''; });
  ['#menu', '#plans'].forEach((sel) => $(sel).addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }));

  // Salva ao sair ou ao mandar o app para segundo plano (comum no celular)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushPending(); });
  window.addEventListener('pagehide', () => { flushPending(); });
  wide.addEventListener('change', () => { if (wide.matches) scheduleRender(); });
}

/* ============================================================
   Inicialização
   ============================================================ */
export async function start() {
  $$('[data-icon]').forEach((el) => { el.innerHTML = ICON[el.dataset.icon] || ''; });
  $('#app-version').textContent = `Versão ${APP_VERSION}. Os dados ficam somente neste aparelho.`;
  $$('img[data-logo-white]').forEach((i) => { i.src = LOGO_URLS['logo-white']; });
  document.body.classList.toggle('touch', isTouch());
  bindEditor();
  bindChrome();

  app.storageKind = await repo.initRepo();
  const migrated = await repo.migrateLegacy();
  const id = migrated || (await repo.getCurrentId());
  if (!id || !(await openPlan(id))) {
    const all = await repo.listPlans();
    if (all.length) await openPlan(all[0].id);
    else { const r = await repo.createPlan(); await openPlan(r.id); }
  }
  if (migrated) toast('Rascunho da versão anterior recuperado.');
  if (app.storageKind === 'memory') { setSaveState('Sem salvamento local', true); toast('Este navegador não permite salvar no aparelho. Use "Exportar" ao terminar o planejamento.', 8000); }
  else setSaveState('Salvo no aparelho');

  initPwa();
  // Carrega o motor de PDF em segundo plano, depois que a tela já está utilizável
  const warm = () => getEngine().catch((err) => console.warn('[lab4] motor de PDF ainda não carregado', err));
  if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 2500 }); else setTimeout(warm, 800);
}

