// b8-shop: the page-layout guard learns two things. (1) The Shop header chips are probed at 360 and 390 px (scenario shop-header; P16/P22
// already read crushed and cut chips). (2) P23, always fails: a food Line's Meal Slot hint ("Tue Dinner +1") is cut by its ellipsis, at every
// width (review: the Supplies group's Restock reason is left out, see check-page-layout.mjs); scenario shop-hints at 390, 834 and 1440 px. Design: docs/dev/design/b8-shop.md. In a browser: scripts/check-page-layout.sh.
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()

interface Scenario { name: string; route: string; start?: string; setup?: string; widths?: number[] }
const rules = createRequire(resolve(cwd, 'package.json'))(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  ALWAYS_FAIL: string[]
  SCENARIOS: Scenario[]
  evaluateMetrics: (m: Record<string, unknown>, ctx: { width: number; route: string; kind: string }) => { rule: string; message: string }[]
}
const driver = readFileSync(resolve(cwd, '../scripts/check-page-layout.mjs'), 'utf8')

const base = (vw: number) => ({
  vw, scrollW: vw, clientW: vw, over: [], content: { x: 24, r: vw - 24 }, railR: 0, container: { x: 24, r: vw - 24 },
  pageWidthAttr: 'wide', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [],
})
const run = (extra: Record<string, unknown>, width = 834) => rules.evaluateMetrics({ ...base(width), ...extra }, { width, route: '/shop', kind: 'wide' })

describe('scenarios', () => {
  it('shop-header: /shop at 360 and 390 px, with a setup the driver has', () => {
    const s = rules.SCENARIOS.find((x) => x.name === 'shop-header')
    expect(s).toMatchObject({ route: '/shop', start: '/shop', setup: 'shopHeader' })
    expect(s?.widths).toEqual(expect.arrayContaining([360, 390]))
    expect(driver).toMatch(/async shopHeader\(\)/)
  })
  it('shop-hints: /shop at 390, 834 and 1440 px, with a setup that waits for an info hint', () => {
    const s = rules.SCENARIOS.find((x) => x.name === 'shop-hints')
    expect(s).toMatchObject({ route: '/shop', start: '/shop', setup: 'shopHints' })
    expect(s?.widths).toEqual(expect.arrayContaining([390, 834, 1440]))
    expect(driver).toMatch(/async shopHints\(\)/)
    expect(driver).toMatch(/list-row__meta\[data-status="info"\]/)
    // review: the setup waits for a seeded Meal Slot hint on a food Line, not only the Supplies group's Restock reason
    expect(driver).toMatch(/\.shop-open \.shop-lines \.list-row__meta\[data-status="info"\]/)
  })
})

describe('P23: the Shop hint is cut by its ellipsis', () => {
  const cut = { sel: 'span.list-row__meta-text', label: 'Includes Tue Dinner and Wed Lunch', shown: 150, px: 80 }
  it('is in ALWAYS_FAIL', () => {
    expect(rules.ALWAYS_FAIL).toContain('P23')
  })
  it('a cut hint is a finding naming the text, what shows and what is cut', () => {
    const p = run({ cutMeta: [cut] }).find((f) => f.rule === 'P23')
    expect(p?.message).toMatch(/^P23 /)
    expect(p?.message).toMatch(/"Includes Tue Dinner and Wed Lunch"/)
    expect(p?.message).toMatch(/150 px/)
    expect(p?.message).toMatch(/80 px/)
  })
  it('no cut hints, or a probe older than the field, is clean', () => {
    expect(run({ cutMeta: [] }).map((f) => f.rule)).not.toContain('P23')
    expect(run({}).map((f) => f.rule)).not.toContain('P23')
  })
  it('the driver measures it (cutMetaProbe, with a Range like P22) and reports it as m.cutMeta', () => {
    expect(driver).toMatch(/const cutMetaProbe\s*=/)
    expect(driver).toMatch(/\.shop-lines \.list-row__meta\[data-status="info"\]/)
    expect(driver).toMatch(/cutMeta:\s*await evaluate\(cutMetaProbe\)/)
    expect(driver).toMatch(/closest\('\.shop-supplies'\)/)
  })
})
