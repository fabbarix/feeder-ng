// B9-14 (DS-01, DS-02, SHORT-02, A11Y-02; plan section 9): page-layout rules P25 and P33 (both always fail), the P18 extension to sheet
// and dialog bodies, the sheet scenario of P39, their probes and scenarios. The files:
//   scripts/lib/page-layout/rules/P25-sheet-targets.mjs   P25: a target under 44 px in an open sheet, overlapping targets, touching bottom-bar labels
//   scripts/lib/page-layout/rules/P33-sheet-body.mjs      P33: a sheet body under min(96px, 30 % of innerHeight), or a footer visible over a clipped first control
//   scripts/lib/page-layout/probes/sheet-targets.mjs      key sheetMetrics  = { sheetTargets, sheetOverlaps, barLabels }
//   scripts/lib/page-layout/probes/sheet-body.mjs         key sheetBody
//   scripts/lib/page-layout/probes/clipped-rings.mjs      (B9-03's, extended here) P18's targets include the controls of an open modal's body
//   scripts/lib/page-layout/probes/focus-rings.mjs        (B9-07's, one name added) P39 also runs on focus-ring-room-sheet
//   scripts/lib/page-layout/scenarios/b9-14.mjs           order 310: leftover-menu-sheet, sheet-planned-meal, sheet-add-member, sheet-short-landscape, sheet-zoom-400, focus-ring-room-sheet
//   scripts/test/fixtures/page-layout-seed/b9-14.mjs      a Leftover for leftover-menu-sheet
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const req = createRequire(resolve(cwd, 'package.json'))
const api = req(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  RULES: { id: string; always: boolean; title: string }[]
  ALWAYS_FAIL: string[]
  PROBES: { name: string; key: string | null; source: string; scenarios?: string[] }[]
  SCENARIOS: { name: string; route: string; start?: string; widths?: (number | string)[]; rules?: string[]; setup?: string }[]
  SCENARIO_VIEWPORTS: Record<string, { width: number; height: number; mobile: boolean; safeArea?: unknown }>
  evaluateMetrics: (m: unknown, c: Ctx) => Finding[]
}
interface Ctx { width: number; route: string; kind: string }
interface Finding { rule: string; message: string }
const read = (p: string) => readFileSync(resolve(cwd, '..', p), 'utf8')

const base = (vw: number) => ({ vw, scrollW: vw, clientW: vw, over: [], content: { x: 24, r: vw - 24 }, railR: 0, container: { x: 24, r: vw - 24 }, pageWidthAttr: 'wide', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [] })
const run = (extra: Record<string, unknown>, rule: string, width = 390) => api.evaluateMetrics({ ...base(width), ...extra }, { width, route: '/', kind: 'narrow' }).filter((f) => f.rule === rule)
const target = (over: Record<string, unknown> = {}) => ({ sel: 'button.list-row__target', w: 350, h: 64, hitW: 350, hitH: 64, ...over })

describe('P25: a target under 44 px in an open sheet, overlapping targets, touching bottom-bar labels', () => {
  it('is active, always fails, and has the plan title', () => {
    expect(api.ALWAYS_FAIL).toContain('P25')
    expect(api.RULES.find((r) => r.id === 'P25')?.title).toBe('A target under 44 px in an open sheet, two overlapping targets, or touching bottom-bar labels (DS-01, DS-02)')
  })
  it('passes 350x64 rows (the DS-01 measure) and a 40 px Close whose hit area is 52', () => {
    expect(run({ sheetMetrics: { sheetTargets: [target(), target({ sel: 'button.close-button', w: 40, h: 40, hitW: 52, hitH: 52 })], sheetOverlaps: [], barLabels: [] } }, 'P25')).toEqual([])
  })
  it('reports the 0x0 target of the beta.8 Leftover sheet', () => {
    const f = run({ sheetMetrics: { sheetTargets: [target({ sel: 'button.list-row__target', w: 0, h: 0, hitW: 0, hitH: 0 })], sheetOverlaps: [], barLabels: [] } }, 'P25')
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toBe('P25 button.list-row__target: a target of 0x0 px in an open sheet; every target is at least 44x44 (the whole row is the target in a Menu sheet)')
  })
  it('reports a 20x40 Close (a shrunk IconButton)', () => {
    const f = run({ sheetMetrics: { sheetTargets: [target({ sel: 'button.icon-button', w: 20, h: 40, hitW: 20, hitH: 40 })], sheetOverlaps: [], barLabels: [] } }, 'P25')
    expect(f).toHaveLength(1)
  })
  it('allows half a pixel of rounding (43.6 is a pass, 43 is not)', () => {
    expect(run({ sheetMetrics: { sheetTargets: [target({ hitW: 43.6 })], sheetOverlaps: [], barLabels: [] } }, 'P25')).toEqual([])
    expect(run({ sheetMetrics: { sheetTargets: [target({ hitW: 43 })], sheetOverlaps: [], barLabels: [] } }, 'P25')).toHaveLength(1)
  })
  it('reports two overlapping targets', () => {
    const f = run({ sheetMetrics: { sheetTargets: [], sheetOverlaps: [{ a: 'button.a', b: 'button.b' }], barLabels: [] } }, 'P25')
    expect(f.map((x) => x.message)).toEqual(['P25 button.a and button.b: two targets overlap in an open sheet; keep them apart'])
  })
  it('reports bottom-bar labels that touch (DS-02: Recipes and Settings at 0.1 px) and passes labels 5 px apart', () => {
    const lab = (text: string, x: number, r: number) => ({ text, box: { x, y: 600, r, b: 612 } })
    const touching = run({ sheetMetrics: { sheetTargets: [], sheetOverlaps: [], barLabels: [lab('Recipes', 100, 142), lab('Settings', 142.1, 190)] } }, 'P25')
    expect(touching).toHaveLength(1)
    expect(touching[0]!.message).toMatch(/^P25 bottom-bar labels "Recipes" and "Settings" touch/)
    expect(run({ sheetMetrics: { sheetTargets: [], sheetOverlaps: [], barLabels: [lab('Recipes', 100, 142), lab('Settings', 147, 190)] } }, 'P25')).toEqual([])
  })
  it('reports nothing where the probe did not run (no sheetMetrics)', () => {
    expect(run({}, 'P25')).toEqual([])
  })
})

describe('P33: a sheet body under the floor, or a footer visible over a clipped first control', () => {
  const body = (over: Record<string, unknown> = {}) => ({ sel: 'dialog.sheet', bodyH: 186, panelH: 332, innerHeight: 390, flow: false, firstControl: { sel: 'input.ui-field__control', clipped: false }, footerVisible: true, ...over })
  it('is active, always fails, and has the plan title', () => {
    expect(api.ALWAYS_FAIL).toContain('P33')
    expect(api.RULES.find((r) => r.id === 'P33')?.title).toBe('A sheet body under min(96px, 30 % of innerHeight), or a footer visible while the first required control is clipped (SHORT-02)')
  })
  it('passes the SHORT-02 after-measure (Planned Meal 844x390: body 186 px)', () => {
    expect(run({ sheetBody: body() }, 'P33', 844)).toEqual([])
  })
  it('reports the beta.8 collapse (0 px of a 332 px panel at 390 px tall)', () => {
    const f = run({ sheetBody: body({ bodyH: 0 }) }, 'P33', 844)
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toBe('P33 dialog.sheet: the sheet body is 0 px of a 332 px panel at 390 px tall, under the 96 px floor; give the body min-block-size min(6rem, 30dvh) and let the footer flow (SHORT-02)')
  })
  it('the floor is 30 % of the height on a short viewport: 76.8 px at 256 px tall', () => {
    expect(run({ sheetBody: body({ innerHeight: 256, bodyH: 77, panelH: 248 }) }, 'P33')).toEqual([])
    expect(run({ sheetBody: body({ innerHeight: 256, bodyH: 70, panelH: 248 }) }, 'P33')).toHaveLength(1)
  })
  it('reports a visible footer while the first control is clipped (Mark as Cooked: the stepper cut, the button shown)', () => {
    const f = run({ sheetBody: body({ firstControl: { sel: 'div.stepper', clipped: true } }) }, 'P33')
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toBe('P33 dialog.sheet: the footer is visible while div.stepper, the first control, is cut off; the question must not hide behind its answer (SHORT-02)')
  })
  it('a clipped first control with no footer on screen is not this rule', () => {
    expect(run({ sheetBody: body({ firstControl: { sel: 'div.stepper', clipped: true }, footerVisible: false }) }, 'P33')).toEqual([])
  })
  it('reports nothing with no sheet open (sheetBody null or absent)', () => {
    expect(run({ sheetBody: null }, 'P33')).toEqual([])
    expect(run({}, 'P33')).toEqual([])
  })
})

describe('probes and scenarios', () => {
  const probe = (name: string) => api.PROBES.find((p) => p.name === name)
  const names = ['leftover-menu-sheet', 'sheet-planned-meal', 'sheet-add-member', 'sheet-short-landscape', 'sheet-zoom-400', 'focus-ring-room-sheet']
  it('registers the two probes under their keys, as in-page code that parses', () => {
    expect(probe('sheet-targets')?.key).toBe('sheetMetrics')
    expect(probe('sheet-body')?.key).toBe('sheetBody')
    for (const n of ['sheet-targets', 'sheet-body']) expect(() => new Function(`return ${probe(n)!.source}`), n).not.toThrow()
  })
  it('the sheet probes run on the sheet scenarios', () => {
    expect(probe('sheet-body')?.scenarios).toEqual(expect.arrayContaining(['leftover-menu-sheet', 'sheet-planned-meal', 'sheet-add-member', 'sheet-short-landscape', 'sheet-zoom-400']))
    expect(probe('sheet-targets')?.scenarios).toEqual(expect.arrayContaining(['leftover-menu-sheet', 'sheet-add-member']))
  })
  it('registers every scenario with a start, a setup and widths of the SHORT-02 sizes', () => {
    for (const n of names) {
      const s = api.SCENARIOS.find((x) => x.name === n)
      expect(s, n).toBeDefined()
      expect(s!.start, n).toBeTruthy()
      expect(s!.setup, n).toBeTruthy()
      expect(s!.widths?.length, n).toBeGreaterThan(0)
    }
    expect(api.SCENARIOS.find((s) => s.name === 'leftover-menu-sheet')?.widths).toEqual([375, 390])
    expect(api.SCENARIOS.find((s) => s.name === 'sheet-planned-meal')?.widths).toContain('844x390')
    expect(api.SCENARIOS.find((s) => s.name === 'sheet-add-member')?.widths).toContain('390x400')
    expect(api.SCENARIOS.find((s) => s.name === 'sheet-short-landscape')?.widths).toContain('844x390-inset')
    expect(api.SCENARIOS.find((s) => s.name === 'sheet-zoom-400')?.widths).toEqual(['375x256'])
  })
  it("SHORT-02's sizes are scenario viewports: phone landscape 844x390 and a 390 px phone with the keyboard up (390x400)", () => {
    expect(api.SCENARIO_VIEWPORTS['844x390']).toEqual({ width: 844, height: 390, mobile: true })
    expect(api.SCENARIO_VIEWPORTS['390x400']).toEqual({ width: 390, height: 400, mobile: true })
  })
  it('each scenario reports only its own rules: P25/P33 for the sheets, P39 for the ring room', () => {
    expect(api.SCENARIOS.find((s) => s.name === 'focus-ring-room-sheet')?.rules).toEqual(['P39'])
    expect(api.SCENARIOS.find((s) => s.name === 'leftover-menu-sheet')?.rules).toEqual(['P25', 'P33'])
  })
  it('P39 runs on the sheet scenario: the focus-rings probe lists it, and it measures an open dialog', () => {
    expect(probe('focus-rings')?.scenarios).toContain('focus-ring-room-sheet')
    expect(probe('focus-rings')?.source).toMatch(/dialog\[open\]/)
  })
  it('P18 is extended to sheet and dialog bodies: the clipped-rings probe reads the open modal body', () => {
    const src = probe('clipped-rings')!.source
    expect(src).toMatch(/dialog\[open\]:modal/)
    expect(src).toMatch(/\.sheet__body, \.dialog__body/)
  })
  it('the seed drop-in exists, with an order from 100 up', () => {
    const seed = read('scripts/test/fixtures/page-layout-seed/b9-14.mjs')
    expect(seed).toMatch(/export const order = \d{3}/)
    expect(seed).toMatch(/export async function seed\(/)
  })
})
