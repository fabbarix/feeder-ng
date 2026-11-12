// TG-S guards: the page-layout guard visits /settings/tags (narrow, a fail route) and the UI guards cover the feature folder.
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
const uiRules = readFileSync(`${cwd}/../scripts/check-ui.rules`, 'utf8')

describe('page-layout guard', () => {
  it('visits /settings/tags: it is in ROUTES, as narrow', () => {
    expect(rules.ROUTES).toContainEqual(['/settings/tags', 'narrow'])
  })

  it('ROUTES agrees with the width table of the shell for /settings/tags', () => {
    expect(pageWidthFor('/settings/tags')).toBe('narrow')
  })

  it('/settings/tags is a fail route', () => {
    expect(rules.modeFor(modes, '/settings/tags')).toBe('fail')
  })

  it('the other fail routes stay', () => {
    for (const route of ['/settings', '/settings/courses', '/settings/shops/4', '/plan', '/recipes/7']) expect(rules.modeFor(modes, route)).toBe('fail')
  })
})

describe('UI guards (scripts/check-ui.rules)', () => {
  const failPaths = uiRules.split('\n').filter((l) => /^[a-z-]+\.fail_paths=/.test(l))

  it('has the per-rule fail_paths lines this check expects', () => {
    expect(failPaths.length).toBeGreaterThanOrEqual(6)
  })

  it.each(failPaths.map((l) => [l.split('=')[0], l.split('=')[1]!.split(/\s+/)] as const))('%s includes web/src/features/tags', (_rule, paths) => {
    expect(paths).toContain('web/src/features/tags')
  })
})
