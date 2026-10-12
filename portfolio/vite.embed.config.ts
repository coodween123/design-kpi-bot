import { defineConfig } from 'vite';

// Один самодостаточный файл для вставки в Tilda: dist-embed/portfolio-embed.js
export default defineConfig({
  build: {
    outDir: 'dist-embed',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    lib: { entry: 'src/embed.ts', name: 'AvatarPortfolio', formats: ['iife'], fileName: () => 'portfolio-embed.js' },
  },
});
