/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The PWA: src/sw/sw.ts is the worker (injectManifest, so it can be extended); registration is ours
// (features/scan/registerSw.ts), so injectRegister is off.
export default defineConfig({
  plugins: [
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
        theme_color: '#1d1b20',
        background_color: '#1d1b20',
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,webmanifest}'],
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
  },
})
