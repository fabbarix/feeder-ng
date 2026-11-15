// B9-02 (DS-07, DS-08): rule P27 of the page-layout guard, in scripts/lib/page-layout/rules/P27-font-24.mjs, and the `font-24`
// scenario definition. Both are pure modules (no browser), so they are tested here, like the other rules.
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const req = createRequire(resolve(cwd, 'package.json'))
// require(esm) (Node 22.12+): loads the plain-Node modules that live outside web/, bypassing Vite.
const p27 = req(resolve(cwd, '../scripts/lib/page-layout/rules/P27-font-24.mjs')) as {
  ROLE_REM: [string, number][]
  roleSizesPx: (rootPx: number) => number[]
  isExempt: (route: string) => boolean
  evaluate: (m: Metrics, ctx: { width: number; route: string; kind: string }) => { rule: string; message: string }[]
}
const scenario = req(resolve(cwd, '../scripts/lib/page-layout/scenarios/font-24.mjs')) as {
  FONT_24: {
    name: string
    fontSizePx: number
    routes: string[]
    widths: number[]
    cdp: { method: string; params: unknown }
    rules: string[]
  }
}

interface Metrics {
  rootPx: number
  h1: number | null
  texts: { sel: string; px: number }[]
  headings: { sel: string; level: number; px: number }[]
}
const ctx = { width: 390, route: '/shop', kind: 'wide' }
const at = (rootPx: number, over: Partial<Metrics> = {}): Metrics => ({ rootPx, h1: 42, texts: [], headings: [], ...over })

describe('P27: the role table (DS-08)', () => {
  it('has the eight text roles of styles.css, in rem', () => {
    const sizes = Object.fromEntries(p27.ROLE_REM)
    expect(sizes).toMatchObject({ display: 2.125, 'title-1': 1.75, 'title-2': 1.375, 'title-3': 1.125, body: 0.9375, meta: 0.8125, overline: 0.75, nav: 0.6875 })
  })
  it('role sizes at 16 px are the old px roles; at 24 px they are 1.5 times larger', () => {
    expect(p27.roleSizesPx(16)).toEqual(expect.arrayContaining([34, 28, 22, 18, 15, 13, 12, 11]))
    expect(p27.roleSizesPx(24)).toEqual(expect.arrayContaining([51, 42, 33, 27, 22.5, 19.5, 18, 16.5]))
  })
  it('at 24 px the h1 is 42 px, a row title 22.5 px and meta 19.5 px (DS-08 behaviour)', () => {
    const px = p27.roleSizesPx(24)
    for (const v of [42, 22.5, 19.5]) expect(px).toContain(v)
  })
})

describe('P27: text off the roles', () => {
  it('text on a role at the current root size is clean', () => {
    const m = at(24, { texts: [{ sel: '.list-row__title', px: 22.5 }, { sel: '.list-row__meta', px: 19.5 }, { sel: 'h1', px: 42 }] })
    expect(p27.evaluate(m, ctx)).toEqual([])
  })

  it('a size from the old px table at 24 px text is a finding: 13 px meta did not scale', () => {
    const f = p27.evaluate(at(24, { texts: [{ sel: '.pg__muted', px: 13 }] }), ctx)
    expect(f).toHaveLength(1)
    expect(f[0]!.rule).toBe('P27')
    expect(f[0]!.message).toContain('.pg__muted')
    expect(f[0]!.message).toContain('13')
  })

  it('unclassed text at the UA 24 px (1rem) at 24 px text is off the roles (body is 22.5)', () => {
    const f = p27.evaluate(at(24, { texts: [{ sel: 'p', px: 24 }] }), ctx)
    expect(f.map((x) => x.rule)).toEqual(['P27'])
  })

  it('allows the half-pixel rounding of a computed style, no more', () => {
    expect(p27.evaluate(at(24, { texts: [{ sel: 'p', px: 22.6 }] }), ctx)).toEqual([])
    expect(p27.evaluate(at(24, { texts: [{ sel: 'p', px: 23.5 }] }), ctx)).toHaveLength(1)
  })

  it('every off-role node is its own finding', () => {
    const f = p27.evaluate(at(24, { texts: [{ sel: 'a', px: 13 }, { sel: 'b', px: 22.5 }, { sel: 'c', px: 14 }] }), ctx)
    expect(f).toHaveLength(2)
  })
})

describe('P27: no heading larger than the page title', () => {
  it('a heading larger than the h1 is a finding with the plan\'s message', () => {
    // the beta.8 case: .pg__tile-title (1.25rem) was 30 px at 24 px text, larger than the 28 px h1 at 16 px
    const f = p27.evaluate(at(16, { h1: 28, texts: [], headings: [{ sel: '.pg__tile-title', level: 2, px: 30 }] }), ctx)
    expect(f).toHaveLength(1)
    expect(f[0]).toEqual({
      rule: 'P27',
      message: 'P27 .pg__tile-title is 30 px, larger than the page title (28 px); headings follow title-1 > title-3 > body-strong (system.md 1)',
    })
  })

  it('a heading equal to or smaller than the h1 is fine, and the h1 itself is never a finding', () => {
    const m = at(24, { h1: 42, headings: [{ sel: 'h1', level: 1, px: 42 }, { sel: 'h2.section-title', level: 2, px: 27 }, { sel: 'h3', level: 3, px: 22.5 }] })
    expect(p27.evaluate(m, ctx)).toEqual([])
  })

  it('a page with no h1 reports no heading finding (A11Y-01 owns the missing h1)', () => {
    expect(p27.evaluate(at(24, { h1: null, headings: [{ sel: 'h2', level: 2, px: 27 }] }), ctx)).toEqual([])
  })

  it('the heading and the role findings are independent: a heading off the roles and larger than the h1 gives both', () => {
    const f = p27.evaluate(at(24, { h1: 42, texts: [{ sel: 'h2.x', px: 50 }], headings: [{ sel: 'h2.x', level: 2, px: 50 }] }), ctx)
    expect(f).toHaveLength(2)
  })
})

describe('P27: board and Cook Mode are excluded (their roles are TB\'s and PC\'s)', () => {
  it.each(['/board', '/cook/12', '/cook/12/timeline'])('%s', (route) => {
    expect(p27.isExempt(route)).toBe(true)
    expect(p27.evaluate(at(24, { texts: [{ sel: '.board__clock', px: 160 }] }), { ...ctx, route })).toEqual([])
  })
  it.each(['/', '/shop', '/settings/shops/1', '/recipes/3'])('%s is read', (route) => {
    expect(p27.isExempt(route)).toBe(false)
  })
})

describe('the font-24 scenario (DS-08)', () => {
  it('sets the standard font size to 24 px through CDP Page.setFontSizes', () => {
    expect(scenario.FONT_24?.name).toBe('font-24')
    expect(scenario.FONT_24?.fontSizePx).toBe(24)
    expect(scenario.FONT_24?.cdp).toEqual({ method: 'Page.setFontSizes', params: { fontSizes: { standard: 24 } } })
  })
  it('reads /, /shop, /settings/shops/:id and /recipes/:id at 390 and 1440', () => {
    expect(scenario.FONT_24?.routes).toEqual(['/', '/shop', '/settings/shops/:id', '/recipes/:id'])
    expect(scenario.FONT_24?.widths).toEqual([390, 1440])
  })
  it('runs P1 (no overflow) and P27 (role census, heading order)', () => {
    expect(scenario.FONT_24?.rules).toEqual(['P1', 'P27'])
  })
})

// w0b integration: P27 and font-24 load in B9-03's registry (a default export each, and the census probe).
describe('P27 and font-24 in the page-layout registry', () => {
  type Mod = { default: Record<string, unknown> }
  const rule = (req(resolve(cwd, '../scripts/lib/page-layout/rules/P27-font-24.mjs')) as Mod).default as {
    id: string
    always: boolean
    evaluate: (m: Record<string, unknown>, c: typeof ctx) => { rule: string }[]
  }
  const reg = (req(resolve(cwd, '../scripts/lib/page-layout/scenarios/font-24.mjs')) as Mod).default as {
    scenarios: { name: string; route: string; start: string; widths: number[]; emulate: unknown[]; rules: string[] }[]
    setups: Record<string, unknown>
  }
  const deferred = req(resolve(cwd, '../scripts/lib/page-layout/scenarios/font-24.mjs')) as {
    FONT_24_DEFERRED: Record<string, string>
    FONT_24_DEFERRED_SCENARIOS: unknown[]
  }
  const probe = (req(resolve(cwd, '../scripts/lib/page-layout/probes/p27-census.mjs')) as Mod).default as {
    key: string
    scenarios: string[]
    source: string
  }
  it('the rule is P27, always fail since B9-55, and reads the census from its own metrics key', () => {
    expect(rule.id).toBe('P27')
    expect(rule.always).toBe(true)
    expect(probe.key).toBe('p27Census')
    expect(rule.evaluate({}, ctx)).toEqual([])
    expect(rule.evaluate({ p27Census: at(24, { texts: [{ sel: 'p.x', px: 21 }] }) }, ctx).map((f) => f.rule)).toEqual(['P27'])
  })
  it('one scenario per route but the deferred ones, at the definition widths, with its CDP text size and rules, and no setup', () => {
    expect(reg.setups).toEqual({})
    expect(reg.scenarios.map((s) => s.route)).toEqual(scenario.FONT_24.routes.filter((r) => !deferred.FONT_24_DEFERRED[r]))
    for (const s of reg.scenarios) {
      expect(s.name.startsWith('font-24-'), s.name).toBe(true)
      expect(s.start).toBe(s.route)
      expect(s.widths).toEqual(scenario.FONT_24.widths)
      expect(s.emulate).toEqual([scenario.FONT_24.cdp])
      expect(s.rules).toEqual(scenario.FONT_24.rules)
    }
  })
  // Main session ruling (w0b) held /settings/shops/:id until its .pg__* styling was gone. B9-09 replaced it (SectionTitle, Muted) and
  // the page passes P27 at 24 px text, so no route is deferred: font-24-settings-shops-id is registered with the others.
  it('no route is deferred: font-24-settings-shops-id is registered', () => {
    expect(deferred.FONT_24_DEFERRED).toEqual({})
    expect(deferred.FONT_24_DEFERRED_SCENARIOS).toEqual([])
    expect(reg.scenarios.find((s) => s.name === 'font-24-settings-shops-id')).toEqual(
      { name: 'font-24-settings-shops-id', route: '/settings/shops/:id', start: '/settings/shops/:id', widths: [390, 1440], emulate: [scenario.FONT_24.cdp], rules: ['P1', 'P27'] },
    )
  })
  it('the census probe runs only on the font-24 scenarios', () => {
    expect(probe.scenarios).toEqual(reg.scenarios.map((s) => s.name))
    expect(probe.source).toContain('getComputedStyle')
  })
})
