// QA-2: the page-layout guard visits /settings/notifications (narrow) and fails the build on it, like the other Settings pages.
import { describe, expect, it } from 'vitest'
import { pageWidthFor } from '../../app/pageWidths'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const rules = createRequire(`${cwd}/package.json`)(`${cwd}/../scripts/lib/page-layout-rules.mjs`) as {
  ROUTES: [string, string][]
  modeFor: (text: string, route: string) => 'warn' | 'fail'
}
const modes = readFileSync(`${cwd}/../scripts/check-page-layout.modes`, 'utf8')

describe('page-layout guard for /settings/notifications', () => {
  it('is in ROUTES, as narrow, and the shell width table agrees', () => {
    expect(rules.ROUTES).toContainEqual(['/settings/notifications', 'narrow'])
    expect(pageWidthFor('/settings/notifications')).toBe('narrow')
  })
  it('is a fail route in scripts/check-page-layout.modes', () => {
    expect(rules.modeFor(modes, '/settings/notifications')).toBe('fail')
  })
})
