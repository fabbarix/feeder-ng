// R2-L: the pure rules of the page-layout guard (scripts/lib/page-layout-rules.mjs): P1..P9, modes, profiles, the route contract.
import { describe, expect, it } from 'vitest'
import { pageWidthFor } from './pageWidths'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
// require(esm) (Node 22.12+): loads the plain-Node module that lives outside web/, bypassing Vite.
const rules = createRequire(resolve(cwd, 'package.json'))(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  PAGE_WIDTH_PX: Record<string, number>
  ROUTES: [string, string][]
  PROFILES: Record<'quick' | 'full', { width: number; height: number; mobile: boolean }[]>
  contrastRatio: (fg: string, bg: string) => number
  evaluateMetrics: (m: Metrics, ctx: { width: number; route: string; kind: string }) => { rule: string; message: string }[]
  modeFor: (text: string, route: string) => 'warn' | 'fail'
  resolveRoute: (pattern: string, ids: Record<string, number>) => string
}

interface Metrics {
  vw: number; scrollW: number; clientW: number; over: string[]
  content: { x: number; r: number }; railR: number; container: { x: number; r: number }
  pageWidthAttr: string | null
  fields: { label: string; type: string; short: boolean; segment: boolean; size: string; w: number; long?: boolean; inline?: boolean }[]
  bars: { cls: string; x: number; r: number; bgAlpha: number }[]
  railContrast: number | null
  dialog: { x: number; w: number; vw: number } | null
}
const ok = (over: Partial<Metrics> = {}): Metrics => ({
  vw: 1440, scrollW: 1440, clientW: 1440, over: [], content: { x: 480, r: 1200 }, railR: 240, container: { x: 440, r: 1240 },
  pageWidthAttr: 'narrow', fields: [], bars: [], railContrast: 7, dialog: null, ...over,
})
const run = (m: Metrics, width = 1440, kind = 'narrow', route = '/settings') => rules.evaluateMetrics(m, { width, route, kind }).map((f) => f.rule)

describe('contrastRatio', () => {
  it('white on soft green is the L-04 bug: 1.31:1', () => {
    expect(rules.contrastRatio('rgb(255, 255, 255)', 'rgb(191, 235, 205)')).toBeCloseTo(1.31, 1)
  })
  it('black on white is 21:1; alpha is ignored', () => {
    expect(rules.contrastRatio('rgb(0, 0, 0)', 'rgb(255, 255, 255)')).toBeCloseTo(21, 3)
    expect(rules.contrastRatio('rgba(0, 0, 0, 1)', 'rgb(255, 255, 255)')).toBeCloseTo(21, 3)
  })
})

describe('evaluateMetrics', () => {
  it('a clean page passes', () => expect(run(ok())).toEqual([]))
  it('P1 sideways scroll, and elements past the right edge', () => {
    expect(run(ok({ scrollW: 1500 }))).toContain('P1')
    expect(run(ok({ over: ['div.wide'] }))).toContain('P1')
  })
  it('P2 off-centre beyond 24 px at >= 1024 only', () => {
    expect(run(ok({ content: { x: 300, r: 1000 } }))).toContain('P2')
    expect(run(ok({ content: { x: 300, r: 1000 }, vw: 820, scrollW: 820, clientW: 820, railR: 0 }), 820)).not.toContain('P2')
    expect(run(ok({ content: { x: 490, r: 1210 } }))).not.toContain('P2')
  })
  it('P3 wider than the route width + 40 at >= 1024 (narrow 720, default 1120, wide 1480)', () => {
    expect(run(ok({ content: { x: 340, r: 1140 } }))).toContain('P3') // 800 > 760
    expect(run(ok({ content: { x: 440, r: 1240 } }), 1440, 'default')).not.toContain('P3')
    expect(rules.PAGE_WIDTH_PX).toEqual({ narrow: 720, default: 1120, wide: 1480 })
  })
  it('P3 and P2 do not apply to full (chromeless) routes', () => {
    expect(run(ok({ content: { x: 0, r: 1440 }, pageWidthAttr: null }), 1440, 'full', '/board')).toEqual([])
  })
  it('P4 short numeric field too wide at >= 820; exempt: data-size full, segmented controls, phones', () => {
    const f = { label: 'Servings', type: 'text', short: true, segment: false, size: '', w: 300 }
    expect(run(ok({ fields: [f] }))).toContain('P4')
    expect(run(ok({ fields: [{ ...f, size: 'full' }] }))).not.toContain('P4')
    expect(run(ok({ fields: [{ ...f, segment: true }] }))).not.toContain('P4')
    expect(run(ok({ fields: [f], vw: 390, scrollW: 390, clientW: 390 }), 390)).not.toContain('P4')
  })
  it('P4 exempts a field that says its width is intended (data-size-intent="long"), by marker and not by label', () => {
    const f = { label: 'Barcode', type: 'text', short: true, segment: false, size: 'md', w: 300 }
    expect(run(ok({ fields: [f] }))).toContain('P4') // a Barcode label alone is no longer enough
    expect(run(ok({ fields: [{ ...f, long: true }] }))).not.toContain('P4')
    expect(run(ok({ fields: [{ ...f, label: 'Servings', long: true }] }))).not.toContain('P4')
  })
  it('P5 collapsed text field (< 160 px)', () => {
    expect(run(ok({ fields: [{ label: 'Name', type: 'text', short: false, segment: false, size: '', w: 100 }] }))).toContain('P5')
  })
  it('P5 exempts a field that sits in an inline-flow control (data-size-intent="inline")', () => {
    const f = { label: 'Add tag', type: 'text', short: false, segment: false, size: '', w: 100 }
    expect(run(ok({ fields: [f] }))).toContain('P5')
    expect(run(ok({ fields: [{ ...f, inline: true }] }))).not.toContain('P5')
  })
  it('P6 sticky bar: transparent, or either edge off the page container by more than 4 px (the draft only failed when BOTH were off)', () => {
    const bar = { cls: 'sticky-action-bar', x: 440, r: 1240, bgAlpha: 1 }
    expect(run(ok({ bars: [bar] }))).toEqual([])
    expect(run(ok({ bars: [{ ...bar, bgAlpha: 0 }] }))).toContain('P6')
    expect(run(ok({ bars: [{ ...bar, r: 1100 }] }))).toContain('P6')
    expect(run(ok({ bars: [{ ...bar, x: 500 }] }))).toContain('P6')
    expect(run(ok({ bars: [{ ...bar, x: 437, r: 1243 }] }))).toEqual([])
  })
  it('P7 current rail item contrast below 4.5; null (no rail) passes', () => {
    expect(run(ok({ railContrast: 1.31 }))).toContain('P7')
    expect(run(ok({ railContrast: 4.5 }))).not.toContain('P7')
    expect(run(ok({ railContrast: null }))).not.toContain('P7')
  })
  it('P8 dialog wider than 600 or off-centre at >= 768', () => {
    expect(run(ok({ dialog: { x: 100, w: 700, vw: 1440 } }))).toContain('P8')
    expect(run(ok({ dialog: { x: 420, w: 600, vw: 1440 } }))).toEqual([])
    expect(run(ok({ dialog: { x: 0, w: 390, vw: 390 }, vw: 390, scrollW: 390, clientW: 390 }), 390)).not.toContain('P8')
  })
  it('P9 the shell must mark the route with the width the table gives it (data-page-width), at every viewport', () => {
    expect(run(ok({ pageWidthAttr: null }))).toContain('P9')
    expect(run(ok({ pageWidthAttr: 'wide' }))).toContain('P9')
    expect(run(ok({ pageWidthAttr: 'narrow' }))).not.toContain('P9')
  })
  it('every failure message names its route-independent rule id first', () => {
    for (const f of rules.evaluateMetrics(ok({ scrollW: 2000 }), { width: 1440, route: '/x', kind: 'narrow' })) expect(f.message).toMatch(new RegExp(`^${f.rule}\\b`))
  })
})

describe('route table contract', () => {
  it('ROUTES is exactly the shell route table: pageWidthFor agrees for every row', () => {
    const ids = { recipeId: 7, ingredientId: 7, productId: 7, shopId: 7 }
    expect(rules.ROUTES.length).toBeGreaterThan(20)
    for (const [pattern, kind] of rules.ROUTES) expect(pageWidthFor(rules.resolveRoute(pattern, ids)), pattern).toBe(kind)
  })
  it('resolveRoute fills :id from the seeded ids by the entity in the path', () => {
    const ids = { recipeId: 3, ingredientId: 11, productId: 5, shopId: 2 }
    expect(rules.resolveRoute('/recipes/:id/edit', ids)).toBe('/recipes/3/edit')
    expect(rules.resolveRoute('/ingredients/:id', ids)).toBe('/ingredients/11')
    expect(rules.resolveRoute('/products/:id', ids)).toBe('/products/5')
    expect(rules.resolveRoute('/settings/shops/:id', ids)).toBe('/settings/shops/2')
    expect(rules.resolveRoute('/plan', ids)).toBe('/plan')
  })
})

describe('profiles', () => {
  it('quick (the check.sh default) is 390, 1440 and 1920; full is the six viewports of the review', () => {
    expect(rules.PROFILES.quick.map((v) => v.width)).toEqual([390, 1440, 1920])
    expect(rules.PROFILES.full.map((v) => v.width)).toEqual([390, 820, 1180, 1440, 1920, 2560])
    expect(rules.PROFILES.full.filter((v) => v.mobile).map((v) => v.width)).toEqual([390])
  })
})

describe('modeFor (scripts/check-page-layout.modes)', () => {
  it('defaults to warn when the file is empty or has no default', () => {
    expect(rules.modeFor('', '/plan')).toBe('warn')
    expect(rules.modeFor('# comment\n', '/plan')).toBe('warn')
  })
  it('default=fail fails every route', () => expect(rules.modeFor('default=fail\n', '/plan')).toBe('fail'))
  it('fail_routes flips listed routes only; a trailing /* matches the subtree; patterns match resolved routes', () => {
    const t = 'default=warn\nfail_routes=/plan /settings/* /recipes/:id\n'
    expect(rules.modeFor(t, '/plan')).toBe('fail')
    expect(rules.modeFor(t, '/settings/members')).toBe('fail')
    expect(rules.modeFor(t, '/recipes/3')).toBe('fail')
    expect(rules.modeFor(t, '/recipes/3/edit')).toBe('warn')
    expect(rules.modeFor(t, '/shop')).toBe('warn')
  })
})

describe('the guard script and rules carry no label exemption', () => {
  const nodeFs = 'node:fs'
  it('reads data-size-intent in the browser and does not match labels against /barcode/', async () => {
    const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
    const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
    const script = readFileSync(`${cwd}/../scripts/check-page-layout.mjs`, 'utf8')
    expect(script).toContain('data-size-intent')
    expect(script).toContain('[data-size-intent="inline"]')
    expect(script).toContain("matches('.sticky-action-bar')") // the bar spans the container: it is not page content (P3)
    expect(readFileSync(`${cwd}/../scripts/lib/page-layout-rules.mjs`, 'utf8')).not.toMatch(/barcode/i)
  })
})
