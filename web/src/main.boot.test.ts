// B9-49 (RES-08): main.tsx puts the cached theme on <html> (applyCachedTheme) BEFORE createRoot, so React's first frame already has the
// User's full token set; main.tsx itself cannot be imported by a test (it mounts the app), so the order is read from its source.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, e: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const main = readFileSync(`${cwd}/src/main.tsx`, 'utf8')

describe('main.tsx boot order', () => {
  it('imports applyCachedTheme and calls it with <html> and the OS dark preference before createRoot(...).render', () => {
    expect(main).toMatch(/import\s*\{\s*applyCachedTheme\s*\}\s*from\s*'\.\/theme\/applyCachedTheme'/)
    const call = main.search(/applyCachedTheme\(\s*document\.documentElement\s*,\s*window\.matchMedia\(\s*'\(prefers-color-scheme: dark\)'\s*\)\.matches\s*\)/)
    expect(call).toBeGreaterThan(-1)
    expect(call).toBeLessThan(main.indexOf('createRoot('))
  })

  it('keeps the service worker registration and the prefetch it already has (B9-59): nothing here removes them', () => {
    expect(main).toContain('registerServiceWorker()')
    expect(main).toContain('createPrefetcher(')
  })
})
