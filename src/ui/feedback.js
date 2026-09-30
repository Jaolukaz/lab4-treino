import { $, $$, esc } from './dom.js';

let toastTimer;
/**
 * @param {string} msg
 * @param {number} ms 0 mantém a mensagem até a ação ser usada
 * @param {{label:string, onClick:Function}} [action]
 */
export function toast(msg, ms = 3800, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" class="toast-btn">${esc(action.label)}</button>` : ''}`;
  if (action) $('.toast-btn', t).onclick = () => { t.classList.remove('on'); action.onClick(); };
  t.classList.add('on');
  clearTimeout(toastTimer);
  if (ms > 0) toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

/**
 * Diálogo modal. Cada ação pode ter `run`, executado de forma síncrona dentro do clique:
 * isso preserva a "ativação do usuário" exigida pelo Safari/iOS para compartilhar arquivos,
 * abrir abas e disparar downloads.
 * @returns {Promise<any>} o `value` da ação escolhida, ou null se o diálogo for fechado
 */
export function ask(title, html, actions) {
  const dlg = $('#dlg');
  $('#dlg-h').textContent = title;
  $('#dlg-b').innerHTML = html;
  $('#dlg-a').innerHTML = actions
    .map((a, i) => `<button type="button" class="btn ${a.cls || 'btn-line'}" data-i="${i}">${a.icon || ''}${esc(a.label)}</button>`)
    .join('');
  return new Promise((resolve) => {
    const done = (v) => { if (dlg.open) dlg.close(); resolve(v); };
    $$('#dlg-a button').forEach((b) => {
      b.onclick = () => {
        const a = actions[+b.dataset.i];
        if (a.run) a.run();
        done(a.value ?? null);
      };
    });
    dlg.oncancel = (e) => { e.preventDefault(); done(null); };
    dlg.onclick = (e) => { if (e.target === dlg) done(null); };
    if (!dlg.open) dlg.showModal();
    const primary = $('#dlg-a .btn-dark, #dlg-a .btn-danger-solid') || $('#dlg-a button:last-child');
    primary?.focus();
  });
}

export function busy(on, msg = 'Processando…') {
  const b = $('#busy');
  $('#busy-msg').textContent = msg;
  b.hidden = !on;
  document.body.setAttribute('aria-busy', on ? 'true' : 'false');
}
