/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { configDefaults } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'
import { phosphorWeights } from './vite.phosphor-weights.ts'

// RES-04: writes `.br` (quality 11) and `.gz` (level 9) next to every text file over 1 KB in the build, so the server
// sends them precompressed (internal/app/spa.go). Images and fonts are already compressed formats and get none. Node's
// fs and zlib are imported at build time by name: the web project has no Node type definitions, so the little it uses
// is typed here.
interface DirEntry {
  name: string
  isDirectory(): boolean
}
interface NodeFs {
  readdir(dir: string, options: { withFileTypes: true }): Promise<DirEntry[]>
  readFile(file: string): Promise<Uint8Array>
  writeFile(file: string, data: Uint8Array): Promise<void>
}
interface NodeZlib {
  brotliCompressSync(data: Uint8Array, options: { params: Record<number, number> }): Uint8Array
  gzipSync(data: Uint8Array, options: { level: number }): Uint8Array
  constants: { BROTLI_PARAM_QUALITY: number; BROTLI_PARAM_SIZE_HINT: number }
}
const nodeModule = <T,>(name: string): Promise<T> => import(/* @vite-ignore */ name) as Promise<T>

// B9-59: which of the app's own modules import a stylesheet (read once per module at build time).
const { readFileSync } = await nodeModule<{ readFileSync(file: string, encoding: 'utf8'): string }>('node:fs')
const isAppScript = (id: string) => /[\\/]web[\\/]src[\\/].*\.tsx?$/.test(id)
const stylesheetImporters = new Map<string, boolean>()
function importsStylesheet(id: string): boolean {
  let found = stylesheetImporters.get(id)
  if (found === undefined) {
    try {
      found = /^\s*import\s+['"][^'"]+\.css['"]/m.test(readFileSync(id, 'utf8'))
    } catch {
      found = true // unreadable: keep it, as before
    }
    stylesheetImporters.set(id, found)
  }
  return found
}

function precompress(): Plugin {
  const COMPRESSIBLE = /\.(js|mjs|css|svg|webmanifest|html|json)$/
  const MIN_BYTES = 1024
  let outDir = 'dist'
  async function files(fs: NodeFs, dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const nested = await Promise.all(entries.map((e) => (e.isDirectory() ? files(fs, `${dir}/${e.name}`) : Promise.resolve([`${dir}/${e.name}`]))))
    return nested.flat()
  }
  return {
    name: 'feeder:precompress',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      const dir = config.build.outDir
      outDir = /^([A-Za-z]:)?[\\/]/.test(dir) ? dir : `${config.root}/${dir}`
    },
    async closeBundle() {
      const fs = await nodeModule<NodeFs>('node:fs/promises')
      const zlib = await nodeModule<NodeZlib>('node:zlib')
      const targets = (await files(fs, outDir)).filter((f) => COMPRESSIBLE.test(f))
      for (const file of targets) {
        const raw = await fs.readFile(file)
        if (raw.length <= MIN_BYTES) continue
        const params = { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length }
        await fs.writeFile(`${file}.br`, zlib.brotliCompressSync(raw, { params }))
        await fs.writeFile(`${file}.gz`, zlib.gzipSync(raw, { level: 9 }))
      }
    },
  }
}

// The vitest files of the "logic" project (test.projects below).
const LOGIC_TESTS = ['src/**/lib/**/*.test.ts', 'src/**/*.css.test.ts']

// The PWA: src/sw/sw.ts is the worker (injectManifest, so it can be extended); registration is ours (app/serviceWorker.ts,
// which offers a new version with a toast), so injectRegister is off. The precache glob never lists the .br/.gz siblings.
export default defineConfig({
  plugins: [
    phosphorWeights(),
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      // The icons are listed once here and precached once through the glob below; no automatic manifest icons.
      includeManifestIcons: false,
      manifest: {
        name: 'Feeder',
        short_name: 'Feeder',
        display: 'standalone',
        start_url: '/',
        // The light page colours of index.html (theme-color and the boot paint); the dark scheme is the metas' business.
        theme_color: '#e7f4eb',
        background_color: '#e7f4eb',
        // The Family Pot: PNGs at two sizes, "any" and "maskable" kept apart (never "any maskable"), and the SVG that scales.
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      injectManifest: {
        // not webmanifest: the PWA plugin adds the manifest to the precache itself; listing it twice breaks Cache.addAll
        globPatterns: ['**/*.{js,css,html,svg,woff2,png,ico}'],
        // The entry chunk is about 1.6 MB raw; the plugin's 2 MiB default would drop it from the precache with only a
        // warning once it grows, and Feeder would no longer open offline. The bundle budget (400 KB brotli) fails first.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
    precompress(),
  ],
  server: { proxy: { '/api': 'http://localhost:8080' } },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    // B9-59: one stylesheet for the whole app, loaded with the entry as before the routes were split: the cascade order
    // stays what it was, whatever order the routes are visited in.
    cssCodeSplit: false,
    // B9-59 (RES-04, route splitting): the routes load on demand (app/lazyScreen.tsx), and these two keep what Today does not
    // use out of the entry chunk.
    rolldownOptions: {
      treeshake: {
        // The app's own modules that import no stylesheet have no side effects: one whose exports nothing uses (a
        // feature's index.ts re-export, say) is left out. A module that imports a stylesheet keeps it, even when nothing
        // uses its exports (its rules may style markup elsewhere), so the CSS is exactly what it was. A module that is
        // used keeps all its statements. Packages keep their own say (package.json sideEffects).
        moduleSideEffects: (id: string, external: boolean) => external || !isAppScript(id) || importsStylesheet(id),
      },
      // app/features.ts imports only `routes`, `navItems` and `useShellStatus` from each feature's index.ts (named globs, so
      // the rest of what an index.ts exports is not pulled into the entry). A feature without navItems or useShellStatus
      // gets undefined for it. tsc still rejects a missing export anywhere in the source, so this hides no real one.
      shimMissingExports: true,
      output: {
        // Everything Today's first paint imports statically goes into one chunk beside the entry, rather than a hundred
        // small shared chunks: one request on a slow line, and it compresses better as one.
        codeSplitting: { groups: [{ name: 'app', tags: ['$initial'] }] },
      },
      onLog(level, log, handler) {
        if (log.code === 'SHIMMED_EXPORT' && /features[\\/][^\\/]+[\\/]index\.ts/.test(log.message) && /"(navItems|useShellStatus)"/.test(log.message)) return
        handler(level, log)
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // node_modules are externalised (untransformed) by default; inline Phosphor so tests see the slimmed weights
    server: { deps: { inline: [/@phosphor-icons/] } },
    // fast-checks: two projects, the same ~2,000 files (src/**/*.test.{ts,tsx}) between them. "logic" is the pure-library tests
    // (any lib/ folder) and the CSS-contract tests (*.css.test.ts): they share no module state worth isolating, so they run in
    // threads without per-file isolation (about 9x faster: 29 s -> 3 s for its ~590 files). "dom" is every other test, isolated
    // as before, in threads (about 12 % faster than forks). Measured and rejected: the logic tests in the node environment (126
    // fail: they read navigator, localStorage), the dom tests without isolation (132 files fail: module mocks leak), happy-dom
    // for the dom tests (70 files fail).
    projects: [
      { extends: true, test: { name: 'logic', include: LOGIC_TESTS, isolate: false, pool: 'threads', unstubGlobals: true, unstubEnvs: true, setupFiles: ['./src/test/logic-isolation.ts'] } },
      { extends: true, test: { name: 'dom', include: ['src/**/*.test.{ts,tsx}'], exclude: [...configDefaults.exclude, ...LOGIC_TESTS], pool: 'threads' } },
    ],
  },
})
