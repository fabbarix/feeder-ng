// B9-07 (DS-09, A11Y-02; plan section 9): page-layout rules P26 and P39, both always fail, with their probes and scenarios. The files:
//   scripts/lib/page-layout/rules/P26-bento-columns.mjs     P26: a BentoGrid loses a column as the window widens (the Today resize walk)
//   scripts/lib/page-layout/rules/P39-ring-room.mjs         P39: a focused control's ring box is clipped, or touches a neighbour or a sticky bar
//   scripts/lib/page-layout/probes/bento-walk.mjs           key bentoWalk,  scenarios ['today-columns']
//   scripts/lib/page-layout/probes/focus-rings.mjs          key focusRings, scenarios ['focus-ring-room-today', 'focus-ring-room-fields']
//   scripts/lib/page-layout/scenarios/b9-07.mjs             order 300: the three scenarios below
// The RESIZE_WALKS table of the facade is a shared file, so P26 does not use it: the bento-walk probe measures the grid column count
// at each width of 900..1320 step 20 itself (same-origin frames of the page, or any other means) and reports the samples; the RULE
// judges them. The plan's walk entry { scenario: 'today-columns', route: '/', from: 900, to: 1320, step: 20 } is the probe's range.
// Metrics shapes (what the probes fill, what the rules read):
//   bentoWalk:  [{ sel, samples: [{ w, cols }, ...] }]  samples in ascending width
//   focusRings: [{ sel, ring: Box, clippers: [{ sel, box: Box }], neighbours: [{ sel, box: Box }], bars: [{ sel, box: Box }], accentOutlines: number }]
//               ring = the focused control's border box grown by its ring (3 px outline + 2 px offset = 5 px, or 0 for an inner ring); a
//               clipper is an ancestor with non-visible overflow (its padding box), a neighbour another focusable control's border box,
//               a bar a sticky or fixed element's box; Box = { x, y, r, b } in px.
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const req = createRequire(resolve(cwd, 'package.json'))
const api = req(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  RULES: { id: string; always: boolean; title: string; evaluate: (m: unknown, c: Ctx) => Finding[] }[]
  ALWAYS_FAIL: string[]
  PROBES: { name: string; key: string | null; source: string; scenarios?: string[] }[]
  SCENARIOS: { name: string; route: string; start?: string; widths?: (number | string)[]; rules?: string[] }[]
  evaluateMetrics: (m: unknown, c: Ctx) => Finding[]
}
interface Ctx { width: number; route: string; kind: string }
interface Finding { rule: string; message: string }

const base = (vw: number) => ({ vw, scrollW: vw, clientW: vw, over: [], content: { x: 24, r: vw - 24 }, railR: 0, container: { x: 24, r: vw - 24 }, pageWidthAttr: 'wide', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [] })
const run = (extra: Record<string, unknown>, rule: string, width = 1440) => api.evaluateMetrics({ ...base(width), ...extra }, { width, route: '/', kind: 'wide' }).filter((f) => f.rule === rule)

describe('P26: a BentoGrid loses a column as the window widens (DS-09)', () => {
  const walk = (cols: number[], from = 900, step = 20) => [{ sel: '.bento-grid.today__grid', samples: cols.map((c, i) => ({ w: from + i * step, cols: c })) }]

  it('is active and always fails (plan section 9)', () => {
    expect(api.RULES.map((r) => r.id)).toContain('P26')
    expect(api.ALWAYS_FAIL).toContain('P26')
  })

  it('reports the 2 -> 1 dip of the beta.8 seam (2 at 960-1020, 1 at 1040) with the plan message', () => {
    const f = run({ bentoWalk: walk([1, 1, 2, 2, 2, 1, 2, 2]) }, 'P26')
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toBe('P26 .bento-grid.today__grid drops from 2 to 1 columns between 1000 and 1020 px; size the tile minimum so the columns survive the rail (system.md 11)')
  })

  it('passes when the columns never fall: 1 at 900-920, 2 from 940 (the after of DS-09)', () => {
    expect(run({ bentoWalk: walk([1, 1, 2, 2, 2, 2, 2, 2, 2]) }, 'P26')).toEqual([])
  })

  it('passes a grid that gains columns the whole way, and a flat one', () => {
    expect(run({ bentoWalk: walk([1, 1, 1, 2, 2, 3, 3]) }, 'P26')).toEqual([])
    expect(run({ bentoWalk: walk([2, 2, 2, 2]) }, 'P26')).toEqual([])
  })

  it('one finding per drop and per grid; two grids are judged apart', () => {
    const two = [...walk([3, 2, 3, 2]), { sel: '.bento-grid.b', samples: [{ w: 900, cols: 2 }, { w: 920, cols: 2 }] }]
    expect(run({ bentoWalk: two }, 'P26')).toHaveLength(2)
  })

  it('reads nothing it has not been given: the resize walk and older probes do not fill bentoWalk', () => {
    expect(run({}, 'P26')).toEqual([])
    expect(run({ bentoWalk: null }, 'P26')).toEqual([])
  })

  it('has its probe, key bentoWalk, on the today-columns scenario only', () => {
    const probe = api.PROBES.find((p) => p.name === 'bento-walk')
    expect(probe?.key).toBe('bentoWalk')
    expect(probe?.scenarios).toEqual(['today-columns'])
    expect(probe?.source).toContain('bento-grid')
  })

  it('Scenario: Widening the window from 900 to 1300 px never takes a column away from Today: today-columns opens / and runs P26 only', () => {
    const s = api.SCENARIOS.find((x) => x.name === 'today-columns')
    expect(s).toMatchObject({ route: '/', start: '/', rules: ['P26'] })
    expect(s?.widths?.length).toBeGreaterThan(0)
  })
})

describe('P39: a focused control\'s ring box is clipped, or touches a neighbour or a sticky bar (A11Y-02)', () => {
  const ring = { x: 100, y: 100, r: 160, b: 148 }
  const ring39 = (over: Record<string, unknown> = {}) => [{ sel: 'button.cook', ring, clippers: [], neighbours: [], bars: [], accentOutlines: 1, ...over }]

  it('is active and always fails (plan section 9)', () => {
    expect(api.RULES.map((r) => r.id)).toContain('P39')
    expect(api.ALWAYS_FAIL).toContain('P39')
  })

  it('passes a ring that lies inside every clipping ancestor, clear of its neighbours and of the bar', () => {
    const f = run({
      focusRings: ring39({
        clippers: [{ sel: '.sheet__body', box: { x: 80, y: 80, r: 400, b: 600 } }],
        neighbours: [{ sel: 'button.menu', box: { x: 163, y: 100, r: 200, b: 148 } }], // 3 px clear (the 8 px fine-pointer gap less a 5 px ring)
        bars: [{ sel: '.sticky-action-bar', box: { x: 0, y: 700, r: 400, b: 760 } }],
      }),
    }, 'P39')
    expect(f).toEqual([])
  })

  it('reports a ring clipped by a scroll container, naming the side and the px (the first field under a sticky header)', () => {
    const f = run({ focusRings: ring39({ sel: 'input.ui-field__input', clippers: [{ sel: '.sheet__body', box: { x: 80, y: 103, r: 400, b: 600 } }] }) }, 'P39')
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toMatch(/^P39 input\.ui-field__input.*clipped by \.sheet__body.*top.*3 px/)
  })

  it('a ring overhanging by under half a pixel is not clipped (rounding)', () => {
    expect(run({ focusRings: ring39({ clippers: [{ sel: '.sheet__body', box: { x: 100.3, y: 80, r: 400, b: 600 } }] }) }, 'P39')).toEqual([])
  })

  it('reports a ring that overlaps or touches a neighbouring control', () => {
    const over = run({ focusRings: ring39({ neighbours: [{ sel: 'button.menu', box: { x: 158, y: 100, r: 200, b: 148 } }] }) }, 'P39')
    expect(over).toHaveLength(1)
    expect(over[0]!.message).toMatch(/^P39 button\.cook.*touches button\.menu/)
    const touch = run({ focusRings: ring39({ neighbours: [{ sel: 'button.menu', box: { x: 160, y: 100, r: 200, b: 148 } }] }) }, 'P39')
    expect(touch).toHaveLength(1)
  })

  it('reports a ring that touches a sticky or fixed bar', () => {
    const f = run({ focusRings: ring39({ bars: [{ sel: '.bottom-bar', box: { x: 0, y: 140, r: 400, b: 200 } }] }) }, 'P39')
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toMatch(/touches the sticky bar \.bottom-bar/)
  })

  it('reports two visible accent outlines at once (a nested control that does not ring inside itself)', () => {
    const f = run({ focusRings: ring39({ sel: 'button.stepper-plus', accentOutlines: 2 }) }, 'P39')
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toMatch(/^P39 button\.stepper-plus.*2 accent outlines/)
  })

  it('reads nothing it has not been given', () => {
    expect(run({}, 'P39')).toEqual([])
    expect(run({ focusRings: null }, 'P39')).toEqual([])
  })

  it('has its probe, key focusRings, on the two ring-room scenarios', () => {
    const probe = api.PROBES.find((p) => p.name === 'focus-rings')
    expect(probe?.key).toBe('focusRings')
    expect(probe?.scenarios).toEqual(['focus-ring-room-today', 'focus-ring-room-fields'])
  })

  it.each(['focus-ring-room-today', 'focus-ring-room-fields'])('scenario %s runs P39 only, at the phone and the desktop width', (name) => {
    const s = api.SCENARIOS.find((x) => x.name === name)
    expect(s?.rules).toEqual(['P39'])
    expect(s?.widths).toEqual([390, 1440])
  })

  it('the Today scenario opens / (hero Cook and menu), the field scenario the recipe editor (stepper, search and field frames)', () => {
    expect(api.SCENARIOS.find((x) => x.name === 'focus-ring-room-today')).toMatchObject({ route: '/', start: '/' })
    expect(api.SCENARIOS.find((x) => x.name === 'focus-ring-room-fields')).toMatchObject({ route: '/recipes/new', start: '/recipes/new' })
  })
})
