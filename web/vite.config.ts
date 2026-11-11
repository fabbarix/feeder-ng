/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { phosphorWeights } from './vite.phosphor-weights.ts'

// The PWA: src/sw/sw.ts is the worker (injectManifest, so it can be extended); registration is ours
// (features/scan/registerSw.ts), so injectRegister is off.
export default defineConfig({
  plugins: [
    phosphorWeights(),
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'Feeder',
        short_name: 'Feeder',
        display: 'standalone',
        start_url: '/',
        // The light page colours of index.html (theme-color and the boot paint); the dark scheme is the metas' business.
        theme_color: '#e7f4eb',
        background_color: '#e7f4eb',
        // The brand mark, an SVG that scales to any size (public/favicon.svg).
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      injectManifest: {
        // not webmanifest: the PWA plugin adds the manifest to the precache itself; listing it twice breaks Cache.addAll
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
      },
    }),
  ],
  server: { proxy: { '/api': 'http://localhost:8080' } },
  build: { outDir: 'dist', emptyOutDir: false },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // node_modules are externalised (untransformed) by default; inline Phosphor so tests see the slimmed weights
    server: { deps: { inline: [/@phosphor-icons/] } },
  },
})
