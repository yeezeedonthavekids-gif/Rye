import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Three entry documents: the browser chrome, the floating overlay layer (menus,
// popovers, suggestions, tooltips) and the internal rye:// pages.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    target: 'chrome130',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        chrome: resolve(__dirname, 'src/renderer/chrome.html'),
        overlay: resolve(__dirname, 'src/renderer/overlay.html'),
        pages: resolve(__dirname, 'src/renderer/pages.html'),
      },
    },
  },
});
