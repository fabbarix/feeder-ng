// R2-3: the adoption flips its routes to fail in the layout guard (scripts/check-page-layout.modes), so a regression on these
// pages fails `PAGE_LAYOUT=quick scripts/check.sh`. Other teams add their own routes; this only pins ours.
import { describe, expect, it } from 'vitest'
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const { modeFor } = createRequire(`${cwd}/package.json`)(`${cwd}/../scripts/lib/page-layout-rules.mjs`) as { modeFor: (text: string, route: string) => 'warn' | 'fail' }
const modes = readFileSync(`${cwd}/../scripts/check-page-layout.modes`, 'utf8')

describe('check-page-layout.modes (R2-3)', () => {
  it.each([
    '/settings', '/settings/household', '/settings/preferences', '/settings/members', '/settings/allowlist',
    '/settings/shops', '/settings/shops/4', '/ingredients', '/ingredients/3', '/products', '/products/5',
  ])('%s is a fail route', (route) => expect(modeFor(modes, route)).toBe('fail'))
})
