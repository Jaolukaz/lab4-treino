/**
 * Build do PWA (versão hospedada): `npm run build:pwa` gera a pasta dist/.
 * O service worker (Workbox) pré-armazena todos os arquivos, inclusive fontes e o gerador de PDF,
 * para que a aplicação funcione sem internet depois da primeira abertura.
 */
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  build: { outDir: 'dist', target: ['es2020', 'safari15', 'chrome100'], assetsInlineLimit: 0, chunkSizeWarningLimit: 1200 },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png'],
      manifest: {
        id: './',
        name: 'Lab-4 Planejamento de Treino',
        short_name: 'Lab-4 Treino',
        description: 'Planejamento individual de treino da Lab-4 Performance, com relatório A4 em PDF.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#FFFFFF',
        theme_color: '#000000',
        categories: ['sports', 'health', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,ttf,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
    }),
  ],
});
