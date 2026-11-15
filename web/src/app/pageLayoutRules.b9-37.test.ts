// B9-37 (RX-09; plan section 9): P12 is extended to the Tag chooser. The files:
//   scripts/lib/page-layout/rules/P12-bottom-bar-overlap.mjs   P12 also reads metrics.optionCover
//   scripts/lib/page-layout/probes/option-cover.mjs            key optionCover, scenarios ['recipe-editor-tag-chooser']
//   scripts/lib/page-layout/scenarios/b9-37.mjs                order 340: recipe-editor-flow, recipe-new-flow, recipe-editor-ring-room,
//                                                              recipe-editor-restored-focus, recipe-editor-tag-chooser
// Metrics shape: optionCover: { options: [{ sel, box, top }], bars: [{ sel, box }] }, Box = { x, y, r, b } in px. An option is covered when a
// bar overlaps it by more than 1 px in both directions AND `top` is false (the element at its centre is not the option). One finding per
// (option, bar) pair. Pure, so vitest tests it.
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const req = createRequire(resolve(cwd, 'package.json'))
const api = req(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  RULES: { id: string; always: boolean; title: string }[]
  PROBES: { name: string; key: string | null; source: string; scenarios?: string[] }[]
  SCENARIOS: { name: string; route: string; start?: string; setup?: string; widths?: (number | string)[]; rules?: string[] }[]
  SETUPS: Record<string, unknown>
  evaluateMetrics: (m: unknown, c: Ctx) => Finding[]
}
interface Ctx { width: number; route: string; kind: string }
interface Finding { rule: string; message: string }

const base = (vw: number) => ({ vw, scrollW: vw, clientW: vw, over: [], content: { x: 24, r: vw - 24 }, railR: 0, container: { x: 24, r: vw - 24 }, pageWidthAttr: 'wide', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [] })
const run = (optionCover: unknown, width = 390) => api.evaluateMetrics({ ...base(width), optionCover }, { width, route: '/recipes/:id/edit', kind: 'phone' }).filter((f) => f.rule === 'P12')
const box = (x: number, y: number, r: number, b: number) => ({ x, y, r, b })
const option = (b: ReturnType<typeof box>, top: boolean, sel = 'div.select__option[quick]') => ({ sel, box: b, top })
const bar = (b: ReturnType<typeof box>, sel = 'div.sticky-action-bar') => ({ sel, box: b })

describe('P12 reads the Tag chooser (RX-09)', () => {
  it('is still P12, by mode (not always-fail): the extension adds no rule', () => {
    const rule = api.RULES.find((r) => r.id === 'P12')
    expect(rule).toBeDefined()
    expect(rule!.always).toBe(false)
  })

  it('an option under the sticky bar, painted over by it, is a finding that names the option, the bar and the overlap', () => {
    const f = run({ options: [option(box(16, 629, 374, 673), false)], bars: [bar(box(16, 624, 374, 692))] })
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toMatch(/^P12 /)
    expect(f[0]!.message).toContain('quick')
    expect(f[0]!.message).toContain('sticky-action-bar')
    expect(f[0]!.message).toMatch(/44 px/)
  })

  it('an option that paints on top is clear even where the boxes overlap (a sheet in the top layer is over the bar)', () => {
    expect(run({ options: [option(box(16, 629, 374, 673), true)], bars: [bar(box(16, 624, 374, 692))] })).toEqual([])
  })

  it('an option above the bar, or beside it, is clear', () => {
    expect(run({ options: [option(box(16, 500, 374, 544), false)], bars: [bar(box(16, 624, 374, 692))] })).toEqual([])
    expect(run({ options: [option(box(400, 629, 500, 673), false)], bars: [bar(box(16, 624, 374, 692))] }, 600)).toEqual([])
  })

  it('touching the bar\'s edge is clear; overlapping by 2 px is not', () => {
    expect(run({ options: [option(box(16, 580, 374, 624), false)], bars: [bar(box(16, 624, 374, 692))] })).toEqual([])
    expect(run({ options: [option(box(16, 582, 374, 626), false)], bars: [bar(box(16, 624, 374, 692))] })).toHaveLength(1)
  })

  it('one finding per option and bar pair', () => {
    const f = run({
      options: [option(box(16, 629, 374, 673), false, 'a'), option(box(16, 640, 374, 684), false, 'b')],
      bars: [bar(box(16, 624, 374, 692), 'bar1'), bar(box(16, 650, 374, 700), 'bar2')],
    })
    expect(f).toHaveLength(4)
  })

  it('no data, or an empty chooser, is clean (a page the probe did not run on)', () => {
    expect(run(undefined)).toEqual([])
    expect(run({ options: [], bars: [] })).toEqual([])
    expect(run({ options: [option(box(16, 629, 374, 673), false)], bars: [] })).toEqual([])
  })

  it('P12\'s old finding (content under the bottom bar) is unchanged', () => {
    const f = api.evaluateMetrics({ ...base(390), navOverlap: [{ sel: 'p.x', px: 12 }] }, { width: 390, route: '/plan', kind: 'phone' }).filter((x) => x.rule === 'P12')
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toContain('12 px')
  })
})

describe('the probe and the scenarios of B9-37', () => {
  it('the option-cover probe fills optionCover, only on the Tag chooser scenario', () => {
    const p = api.PROBES.find((x) => x.name === 'option-cover')
    expect(p).toBeDefined()
    expect(p!.key).toBe('optionCover')
    expect(p!.scenarios).toEqual(['recipe-editor-tag-chooser'])
    expect(() => new Function(p!.source)).not.toThrow()
  })

  it.each([
    ['recipe-editor-flow', '/recipes/:id/edit', [375, 834, 1440]],
    ['recipe-new-flow', '/recipes/new', [375, 1440]],
    ['recipe-editor-ring-room', '/recipes/:id/edit', [375, 1440]],
    ['recipe-editor-restored-focus', '/recipes/:id/edit', [375, 390]],
    ['recipe-editor-tag-chooser', '/recipes/:id/edit', [375, 1440]],
  ])('scenario %s is registered with a setup, on %s, at %j', (name, route, widths) => {
    const s = api.SCENARIOS.find((x) => x.name === name)
    expect(s, name).toBeDefined()
    expect(s).toMatchObject({ route, start: route })
    expect(s!.widths).toEqual(widths)
    expect(typeof api.SETUPS[s!.setup!]).toBe('function')
  })

  it('no scenario runs below 375 px (amendment A1)', () => {
    for (const s of api.SCENARIOS.filter((x) => /^recipe-(editor|new)-/.test(x.name))) {
      for (const w of s.widths ?? []) expect(typeof w === 'number' ? w : 375, s.name).toBeGreaterThanOrEqual(375)
    }
  })

  it('the focus-ring probe also walks the editor page of B9-37 (P39), at the phone and the desktop width', () => {
    expect(api.PROBES.find((x) => x.name === 'focus-rings')?.scenarios).toContain('recipe-editor-ring-room')
    expect(api.SCENARIOS.find((x) => x.name === 'recipe-editor-ring-room')?.rules).toEqual(['P39'])
  })

  it('the Tag chooser scenario reports P12 only', () => {
    expect(api.SCENARIOS.find((x) => x.name === 'recipe-editor-tag-chooser')?.rules).toEqual(['P12'])
  })
})
