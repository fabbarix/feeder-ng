// R2-1: /recipes/:id, /recipes/:id/edit and /recipes/new are flipped to fail in the page-layout guard
// (scripts/check-page-layout.modes). Once the package is built, the guard passes on them in fail mode.
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const rules = createRequire(resolve(cwd, 'package.json'))(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  modeFor: (text: string, route: string) => 'warn' | 'fail'
}
const modes = readFileSync(resolve(cwd, '../scripts/check-page-layout.modes'), 'utf8')

describe('page-layout guard modes (R2-1)', () => {
  // The guard asks with resolved routes (resolveRoute turns :id into the seeded id).
  it.each(['/recipes/3', '/recipes/3/edit', '/recipes/new'])('%s is a fail route', (route) => {
    expect(rules.modeFor(modes, route)).toBe('fail')
  })
  it('lists the patterns in fail_routes', () => {
    const line = /^fail_routes=(.*)$/m.exec(modes)?.[1] ?? ''
    for (const pattern of ['/recipes/:id', '/recipes/:id/edit', '/recipes/new']) expect(line.split(/\s+/)).toContain(pattern)
  })
  it('does not flip the other recipes routes: the list is R2-L, import and export belong to R2-4 / the Recipe Assistant', () => {
    for (const route of ['/recipes', '/recipes/import', '/recipes/export']) expect(rules.modeFor(modes, route)).toBe('warn')
  })
  it('warn_routes win over fail_routes (":id" matches "import" and "export" otherwise)', () => {
    const text = 'default=warn\nfail_routes=/recipes/:id\nwarn_routes=/recipes/import\n'
    expect(rules.modeFor(text, '/recipes/import')).toBe('warn')
    expect(rules.modeFor(text, '/recipes/7')).toBe('fail')
    expect(rules.modeFor('default=warn\nfail_routes=/recipes/:id\n', '/recipes/import')).toBe('fail')
  })
  it('keeps the default in warn mode', () => {
    expect(modes).toMatch(/^default=warn$/m)
  })
})
