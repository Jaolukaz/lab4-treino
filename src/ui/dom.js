export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function debounce(fn, ms) {
  let t;
  let lastArgs;
  const d = (...a) => { lastArgs = a; clearTimeout(t); t = setTimeout(() => { t = null; fn(...a); }, ms); };
  d.flush = () => { if (t) { clearTimeout(t); t = null; return fn(...(lastArgs || [])); } return undefined; };
  d.pending = () => !!t;
  return d;
}

export const isTouch = () => matchMedia('(pointer: coarse)').matches;
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const fmtSize = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`);

const svg = (d, sw = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  cam: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', 1.8),
  gallery: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>', 1.8),
  up: svg('<path d="M6 15l6-6 6 6"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  pdf: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
  exp: svg('<path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"/>'),
  imp: svg('<path d="M12 15V3m0 0L8 7m4-4l4 4M5 21h14"/>'),
  list: svg('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  install: svg('<path d="M12 3v11m0 0l-4-4m4 4l4-4M4 17v3h16v-3"/>'),
  share: svg('<path d="M12 3v12M8 7l4-4 4 4M5 12v8h14v-8"/>'),
  open: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>'),
  chev: svg('<path d="M6 9l6 6 6-6"/>'),
  ball: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8l3.3 2.4-1.3 3.9h-4l-1.3-3.9z" fill="currentColor"/><path d="M12 8V3.2M15.3 10.4l4.2-1.5M14 14.3l2.6 3.8M10 14.3l-2.6 3.8M8.7 10.4 4.5 8.9"/>', 1.6),
};
