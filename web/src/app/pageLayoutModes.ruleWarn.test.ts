// B9-13 (main session ruling): a per-rule warn line in the page-layout modes, "Pnn@/route = warn [until B9-NN]"
// (scripts/lib/page-layout-rules.mjs parseModes / countFindings, scripts/lib/page-layout/README.md). It makes one by-mode rule
// warn on one route (and its scenarios); every other rule keeps the route's mode.
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { readFileSync, readdirSync } = (await import(/* @vite-ignore */ nodeFs)) as {
  readFileSync: (p: string, e: string) => string
  readdirSync: (p: string) => string[]
}
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const rules = createRequire(resolve(cwd, 'package.json'))(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  parseModes: (text: string) => { errors: { line: number; text: string; why: string }[]; ruleWarn: { rule: string; pattern: string; until: string | null }[] }
  countFindings: (text: string, output: string) => { fail: number; bridged: unknown[] }
  countRuleWarned: (text: string, output: string) => { rule: string; pattern: string; until: string | null; n: number }[]
  modeFor: (text: string, route: string) => 'warn' | 'fail'
  ruleWarnFor: (text: string, rule: string, label: string) => { rule: string; pattern: string; until: string | null } | null
}

const modes = 'default=warn\nfail_routes=/pantry /settings/*\nP41@/pantry = warn until B9-29\nP40@/settings/tags = warn\n'
const line = (route: string, rule: string, w = 390) => `  - ${w}px ${route}: ${rule} something`

describe('parseModes: Pnn@/route = warn', () => {
  it('reads the rule, the pattern and the optional until', () => {
    expect(rules.parseModes(modes).errors).toEqual([])
    expect(rules.parseModes(modes).ruleWarn).toEqual([
      { rule: 'P41', pattern: '/pantry', until: 'B9-29' },
      { rule: 'P40', pattern: '/settings/tags', until: null },
    ])
  })
  it('a malformed line, a fail mode or an always-fail rule is an error, never dropped', () => {
    for (const bad of ['P41@pantry = warn', 'P41@/pantry = fail', 'P41@/pantry', 'P41 @ /pantry = warn later', 'P1@/pantry = warn']) {
      expect(rules.parseModes(bad).errors, bad).toHaveLength(1)
    }
  })
  it('does not change the route mode', () => {
    expect(rules.modeFor(modes, '/pantry')).toBe('fail')
  })
})

describe('countFindings with a per-rule line', () => {
  it('the named rule warns on the named route and its scenarios; it is counted per line', () => {
    const out = [line('/pantry', 'P41'), line('/pantry#text-spacing', 'P41'), line('/settings/tags', 'P40')].join('\n')
    expect(rules.countFindings(modes, out).fail).toBe(0)
    expect(rules.countRuleWarned(modes, out)).toEqual([
      { rule: 'P41', pattern: '/pantry', until: 'B9-29', n: 2 },
      { rule: 'P40', pattern: '/settings/tags', until: null, n: 1 },
    ])
  })
  it('another rule on that route, or the rule on another route, keeps the route mode', () => {
    expect(rules.countFindings(modes, line('/pantry', 'P40')).fail).toBe(1)
    expect(rules.countFindings(modes, line('/settings/members', 'P40')).fail).toBe(1)
    expect(rules.countFindings(modes, line('/supplies', 'P41')).fail).toBe(0) // default warn
  })
  it('a line with no finding is still reported, with 0', () => {
    expect(rules.countRuleWarned(modes, '').map((w) => w.n)).toEqual([0, 0])
  })
})

describe("B9-13's drop-in", () => {
  const dir = resolve(cwd, '../scripts/check-page-layout.modes.d')
  const text = readdirSync(dir)
    .filter((n) => !n.startsWith('.'))
    .sort()
    .map((n) => readFileSync(resolve(dir, n), 'utf8'))
    .join('\n')
  const own = readFileSync(resolve(dir, '20-b9-13-p40-p41-warn'), 'utf8')
  it('names P41 on /pantry and P40 on the two Settings pages, and no whole route', () => {
    expect(rules.parseModes(own).errors).toEqual([])
    expect(rules.parseModes(own).ruleWarn.map((w) => `${w.rule}@${w.pattern}`)).toEqual(['P41@/pantry', 'P40@/settings/tags', 'P40@/settings/recipe-assistant'])
    expect(own).not.toMatch(/^\s*warn_routes\s*=/m)
  })
  it('leaves /pantry in fail mode for every other rule', () => {
    const base = readFileSync(resolve(cwd, '../scripts/check-page-layout.modes'), 'utf8')
    expect(rules.modeFor(`${base}\n${text}`, '/pantry')).toBe('fail')
  })
})

describe("w2a's drop-in (ruling e: P36 on Your preferences until B9-19)", () => {
  const dir = resolve(cwd, '../scripts/check-page-layout.modes.d')
  const own = readFileSync(resolve(dir, '30-b9-w2a-p36-preferences-warn'), 'utf8')
  const base = readFileSync(resolve(cwd, '../scripts/check-page-layout.modes'), 'utf8')
  const all = `${base}\n${readdirSync(dir)
    .filter((n) => !n.startsWith('.'))
    .sort()
    .map((n) => readFileSync(resolve(dir, n), 'utf8'))
    .join('\n')}`
  it('is the one line P36@/settings/preferences, until B9-19, and no whole route', () => {
    expect(rules.parseModes(own).errors).toEqual([])
    expect(rules.parseModes(own).ruleWarn).toEqual([{ rule: 'P36', pattern: '/settings/preferences', until: 'B9-19' }])
    expect(own).not.toMatch(/^\s*(warn_routes|fail_routes|default|width)\b/m)
  })
  it('covers P36 in the touch-targets-controls scenario and nothing else there or on other Settings pages', () => {
    expect(rules.ruleWarnFor(all, 'P36', '/settings/preferences#touch-targets-controls')).not.toBeNull()
    expect(rules.ruleWarnFor(all, 'P1', '/settings/preferences#touch-targets-controls')).toBeNull()
    expect(rules.ruleWarnFor(all, 'P36', '/settings/household')).toBeNull()
    expect(rules.modeFor(all, '/settings/preferences')).toBe('fail')
  })
})
