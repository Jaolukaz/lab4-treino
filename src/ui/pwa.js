/**
 * Integração PWA: registro do service worker com aviso de atualização,
 * convite de instalação (Android/desktop via beforeinstallprompt; iOS via instruções)
 * e pedido de armazenamento persistente.
 *
 * Instalar na tela de início não é só conveniência no iPhone: o WebKit isenta apps
 * instalados da limpeza automática de dados após 7 dias sem uso no Safari.
 */
import { registerSW } from 'virtual:pwa-register';
import { $, $$, isIOS, isStandalone } from './dom.js';
import { toast } from './feedback.js';
import { getMeta, setMeta } from '../storage/repo.js';

let deferredPrompt = null;

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* opcional */ }
}

function setInstallVisible(on) {
  $$('[data-cmd="install"]').forEach((b) => { b.hidden = !on; });
}

async function showBanner(kind) {
  if (isStandalone() || (await getMeta('installBannerDismissed'))) return;
  const banner = $('#install-banner');
  const text = $('#install-text');
  const btn = $('#install-go');
  if (kind === 'ios') {
    text.innerHTML = 'Para usar offline e não perder planejamentos, instale o app: no Safari, toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.';
    btn.hidden = true;
  } else {
    text.textContent = 'Instale o app para abrir em tela cheia, usar sem internet e manter os planejamentos protegidos.';
    btn.hidden = false;
  }
  banner.hidden = false;
}

export async function promptInstall() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  setInstallVisible(false);
  $('#install-banner').hidden = true;
  if (outcome === 'accepted') toast('App instalado. Abra pelo ícone Lab-4 Treino na tela inicial.');
}

export function initPwa() {
  setInstallVisible(false);
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    setInstallVisible(true);
    showBanner('android');
  });
  window.addEventListener('appinstalled', () => { $('#install-banner').hidden = true; setInstallVisible(false); });
  if (isIOS() && !isStandalone()) showBanner('ios');

  $('#install-close').addEventListener('click', () => { $('#install-banner').hidden = true; setMeta('installBannerDismissed', true); });
  $('#install-go').addEventListener('click', promptInstall);

  const updateSW = registerSW({
    onNeedRefresh() {
      toast('Há uma nova versão da aplicação.', 0, { label: 'Atualizar', onClick: () => updateSW(true) });
    },
    onOfflineReady() {
      toast('Pronto: a aplicação agora funciona sem internet.');
    },
  });

  if (isStandalone()) requestPersistence();
}
