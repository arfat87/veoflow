import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(import.meta.dirname, 'app/renderer'),
  base: './',
  build: {
    outDir: resolve(import.meta.dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        hud: resolve(import.meta.dirname, 'app/renderer/hud/overlay.html'),
        settings: resolve(import.meta.dirname, 'app/renderer/settings/settings.html')
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
