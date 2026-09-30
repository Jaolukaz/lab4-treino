import './styles/app.css';
import { start } from './app.js';

start().catch((err) => {
  console.error(err);
  document.querySelectorAll('[data-save-state]').forEach((el) => { el.textContent = 'Erro ao iniciar. Recarregue a página.'; });
});
