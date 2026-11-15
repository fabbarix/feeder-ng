// B9-16 (A11Y-09, SET-07; plan section 9): page-layout rule P36 (by mode) with its probe and scenarios. The files:
//   scripts/lib/page-layout/rules/P36-targets.mjs     P36: a hit area under 44 px, or two overlapping hit areas, on a touch emulation
//   scripts/lib/page-layout/probes/targets.mjs        key targets, scenarios ['touch-targets-controls']
//   scripts/lib/page-layout/scenarios/b9-16.mjs       order 310: touch-targets-controls (P36 only) and household-errors
// Metrics shape (what the probe fills, what the rule reads):
//   targets: { coarse, items: [{ i, sel, w, h, hit: { x, y, r, b }, anc: [i...], inline }] } | null
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const req = createRequire(resolve(cwd, 'package.json'))
const api = req(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  RULES: { id: string; always: boolean; title: string }[]
  ALWAYS_FAIL: string[]
  PROBES: { name: string; key: string | null; source: string; scenarios?: string[] }[]
  SCENARIOS: { name: string; route: string; start?: string; widths?: (number | string)[]; rules?: string[]; emulate?: { method: string; params?: Record<string, unknown> }[]; setup?: string }[]
  evaluateMetrics: (m: unknown, c: Ctx) => Finding[]
}
interface Ctx { width: number; route: string; kind: string }
interface Finding { rule: string; message: string }
interface Item { i: number; sel: string; w: number; h: number; hit: { x: number; y: number; r: number; b: number }; anc: number[]; inline: boolean }

const base = (vw: number) => ({ vw, scrollW: vw, clientW: vw, over: [], content: { x: 16, r: vw - 16 }, railR: 0, container: { x: 16, r: vw - 16 }, pageWidthAttr: 'wide', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [] })
const run = (targets: unknown, width = 390) => api.evaluateMetrics({ ...base(width), targets }, { width, route: '/settings/preferences', kind: 'default' }).filter((f) => f.rule === 'P36')
const item = (i: number, sel: string, x: number, y: number, w: number, h: number, extra: Partial<Item> = {}): Item => ({ i, sel, w, h, hit: { x, y, r: x + w, b: y + h }, anc: [], inline: false, ...extra })

describe('P36: a touch target under 44 px, or two that overlap (A11Y-09)', () => {
  it('is active and always fail since B9-55 (plan section 9, "by mode -> B9-55")', () => {
    const rule = api.RULES.find((r) => r.id === 'P36')
    expect(rule).toBeDefined()
    expect(rule!.always).toBe(true)
    expect(api.ALWAYS_FAIL).toContain('P36')
    expect(rule!.title).toMatch(/44 px/)
  })

  it('reports nothing without metrics, or on a pointer that is not coarse', () => {
    expect(run(undefined)).toEqual([])
    expect(run(null)).toEqual([])
    expect(run({ coarse: false, items: [item(0, 'button.tiny', 0, 0, 20, 20)] })).toEqual([])
  })

  it('a hit area of 44 x 44 or more passes; 52 x 52 (the IconButton with its ::after) passes', () => {
    expect(run({ coarse: true, items: [item(0, 'button.a', 0, 0, 44, 44), item(1, 'button.b', 100, 0, 52, 52)] })).toEqual([])
  })

  it('a hit area under 44 px in either direction is a finding naming the control and its size', () => {
    const f = run({ coarse: true, items: [item(0, 'button.segmented__option', 0, 0, 120, 40), item(1, 'button.switch', 200, 0, 40, 52)] })
    expect(f).toHaveLength(2)
    expect(f[0]!.message).toMatch(/^P36 button\.segmented__option: .*120 x 40/)
    expect(f[1]!.message).toContain('button.switch')
    expect(f[0]!.message).toMatch(/::after/)
  })

  it('half a pixel under is rounding, not a finding', () => {
    expect(run({ coarse: true, items: [item(0, 'button.a', 0, 0, 43.6, 43.6)] })).toEqual([])
    expect(run({ coarse: true, items: [item(0, 'button.a', 0, 0, 43.4, 44)] })).toHaveLength(1)
  })

  it('a link inside running text is exempt (WCAG 2.5.8)', () => {
    expect(run({ coarse: true, items: [item(0, 'a.link', 0, 0, 60, 18, { inline: true })] })).toEqual([])
  })

  it('two hit areas that overlap by more than a pixel are a finding that points at IconSet', () => {
    const f = run({ coarse: true, items: [item(0, 'button.icon-button[aria-label="Swap"]', 0, 0, 44, 44), item(1, 'button.icon-button[aria-label="Pin"]', 36, 0, 44, 44)] })
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toMatch(/overlap by 8 x 44/)
    expect(f[0]!.message).toContain('IconSet')
  })

  it('abutting hit areas (the Segmented options) and a one-pixel overlap are fine', () => {
    expect(run({ coarse: true, items: [item(0, 'a', 0, 0, 100, 48), item(1, 'b', 100, 0, 100, 48), item(2, 'c', 199, 0, 100, 48)] })).toEqual([])
  })

  it('a control inside another control (a button in a role=button row) is not an overlap', () => {
    const outer = item(0, 'div.row[role=button]', 0, 0, 300, 60)
    const inner = item(1, 'button.icon-button', 250, 8, 44, 44, { anc: [0] })
    expect(run({ coarse: true, items: [outer, inner] })).toEqual([])
  })

  it('overlaps are only reported once for a pair, and a link in text does not count', () => {
    const f = run({ coarse: true, items: [item(0, 'a', 0, 0, 60, 48), item(1, 'b', 30, 0, 60, 48), item(2, 'a.in-text', 0, 0, 60, 20, { inline: true })] })
    expect(f).toHaveLength(1)
  })

  it('runs through the facade at every width (the driver passes the metrics of the page)', () => {
    expect(run({ coarse: true, items: [item(0, 'button.a', 0, 0, 30, 30)] }, 375)).toHaveLength(1)
  })
})

describe('the targets probe and the B9-16 scenarios are registered', () => {
  it('the probe fills `targets`, only on its scenario', () => {
    const p = api.PROBES.find((x) => x.name === 'targets')
    expect(p).toBeDefined()
    expect(p!.key).toBe('targets')
    expect(p!.scenarios).toEqual(['touch-targets-controls'])
    expect(p!.source).toContain('(pointer: coarse)')
    expect(p!.source).toContain("'::after'")
  })

  it('touch-targets-controls: Your preferences at 375 and 390, on a touch emulation, P36 only', () => {
    const s = api.SCENARIOS.find((x) => x.name === 'touch-targets-controls')
    expect(s).toBeDefined()
    expect(s!.route).toBe('/settings/preferences')
    expect(s!.widths).toEqual([375, 390])
    expect(s!.rules).toEqual(['P36'])
    expect(s!.emulate!.map((c) => c.method)).toContain('Emulation.setTouchEmulationEnabled')
  })

  it('household-errors: the Household form at 375 and 390 (A1: nothing below 375), after a failed save', () => {
    const s = api.SCENARIOS.find((x) => x.name === 'household-errors')
    expect(s).toBeDefined()
    expect(s!.route).toBe('/settings/household')
    expect(s!.start).toBe('/settings/household')
    expect(s!.widths).toEqual([375, 390])
    expect(s!.setup).toBe('householdErrors')
    expect(s!.widths).not.toContain(320)
    expect(s!.rules).toContain('P40')
  })
})
