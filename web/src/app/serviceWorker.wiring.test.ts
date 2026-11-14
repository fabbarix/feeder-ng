// B9-21 (RES-10): registration is an app concern, not Scan's. The old features/scan/registerSw.ts is gone, main.tsx registers
// the worker from app/serviceWorker, and main.tsx mounts AppUpdate (so the toast can appear; AppShell is not touched).
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const fs = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string; existsSync: (p: string) => boolean }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const read = (rel: string) => fs.readFileSync(`${cwd}/src/${rel}`, 'utf8')

describe('where the service worker is registered', () => {
  it('features/scan/registerSw.ts is gone and Scan registers nothing', () => {
    expect(fs.existsSync(`${cwd}/src/features/scan/registerSw.ts`)).toBe(false)
    expect(read('features/scan/index.ts')).not.toMatch(/registerSw|registerServiceWorker/)
  })
  it('main.tsx registers it from app/serviceWorker, once', () => {
    const main = read('main.tsx')
    expect(main).toMatch(/from '\.\/app\/serviceWorker'/)
    expect(main.match(/registerServiceWorker\(/g)?.length).toBe(1)
  })
  it('main.tsx mounts <AppUpdate> beside <AppRoot>, with the same status hooks, inside the router and the toast provider', () => {
    const main = read('main.tsx')
    expect(main).toMatch(/from '\.\/app\/AppUpdate'/)
    expect(main).toMatch(/<AppUpdate[^>]*statusHooks=\{statusHooks\}/)
  })
})
