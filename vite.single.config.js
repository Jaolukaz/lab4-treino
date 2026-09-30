/**
 * Build em arquivo único (versão para computador, abre direto do disco):
 * `npm run build:single` gera dist-single/index.html com tudo embutido.
 * Sem service worker, que não existe em file://.
 */
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const favicon = `data:image/png;base64,${readFileSync(new URL('./public/icons/favicon-64.png', import.meta.url)).toString('base64')}`;
/** Embute o favicon e remove o ícone de tela inicial, que não se aplica ao arquivo local. */
const inlineIcons = {
  name: 'lab4-inline-icons',
  transformIndexHtml: (html) => html
    .replace('href="icons/favicon-64.png"', `href="${favicon}"`)
    .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, ''),
};

export default defineConfig({
  base: './',
  publicDir: false,
  resolve: { alias: { 'virtual:pwa-register': fileURLToPath(new URL('./src/pwa/register-stub.js', import.meta.url)) } },
  build: { outDir: 'dist-single', target: ['es2020', 'safari15', 'chrome100'], assetsInlineLimit: () => true, chunkSizeWarningLimit: 4000 },
  plugins: [inlineIcons, viteSingleFile({ removeViteModuleLoader: true })],
});
