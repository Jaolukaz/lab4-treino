/**
 * Entrega de arquivos gerados (PDF e exportação .json).
 * No celular, o caminho principal é a folha de compartilhamento nativa (Web Share API),
 * que leva o arquivo direto ao WhatsApp, ao app Arquivos, ao e-mail etc.
 * O compartilhamento é disparado dentro do clique de um botão, porque navegadores exigem
 * um gesto recente do usuário e a geração do PDF, sendo assíncrona, consumiria esse gesto.
 */
import { ask, toast } from './feedback.js';
import { ICON, esc, fmtSize, isStandalone, isTouch } from './dom.js';

export function canShareFile(file) {
  try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] })); } catch { return false; }
}

export function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function share(file, title) {
  navigator.share({ files: [file], title }).catch((err) => {
    if (err && err.name === 'AbortError') return;
    toast('Não foi possível abrir o compartilhamento. O arquivo foi baixado.');
    download(file);
  });
}

function openInTab(file) {
  const url = URL.createObjectURL(file);
  const w = window.open(url, '_blank', 'noopener');
  if (!w) download(file);
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
}

/**
 * @param {File} file
 * @param {{title:string, heading:string, note?:string, kind:'pdf'|'json'}} opts
 */
export async function deliver(file, { title, heading, note = '', kind }) {
  const shareable = canShareFile(file);
  const touch = isTouch();
  const actions = [];
  if (kind === 'pdf' && !touch && !isStandalone()) actions.push({ label: 'Abrir', icon: ICON.open, run: () => openInTab(file), value: 'open' });
  actions.push({ label: 'Baixar', icon: ICON.exp, run: () => download(file), value: 'download', cls: shareable && touch ? 'btn-line' : 'btn-dark' });
  if (shareable) actions.push({ label: 'Compartilhar', icon: ICON.share, run: () => share(file, title), value: 'share', cls: touch ? 'btn-dark' : 'btn-line' });
  const hint = shareable
    ? 'Compartilhar abre as opções do aparelho, como WhatsApp, e-mail ou salvar em Arquivos.'
    : 'O arquivo será salvo na pasta de downloads do aparelho.';
  return ask(heading, `<p class="file-card"><b>${esc(file.name)}</b><span>${fmtSize(file.size)}</span></p>${note}<p class="hint">${hint}</p>`, actions);
}
