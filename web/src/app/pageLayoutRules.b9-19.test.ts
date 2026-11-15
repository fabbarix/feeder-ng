// B9-19 (DS-02, SHORT-04, SHORT-05; plan section 9): page-layout rules P31 (always), P32 (by mode) and P35 (always), with their probes and
// scenarios. The files:
//   scripts/lib/page-layout/rules/P31-bottom-bar-squircle.mjs   P31: a bottom-bar squircle that is not square, or not 6 px inside the bar
//   scripts/lib/page-layout/rules/P32-chrome-budget.mjs         P32: fixed and sticky chrome covers more than 35 % of the viewport height
//   scripts/lib/page-layout/rules/P35-safe-gutters.mjs          P35: content inside a safe-area inset
//   scripts/lib/page-layout/probes/{bottom-bar-squircles,chrome-budget,safe-gutters}.mjs   keys barSquircles, chromeBudget, safeGutters
//   scripts/lib/page-layout/scenarios/b9-19.mjs                 order 330
// Metrics shapes:
//   barSquircles: null | { bar: Box, links: [{ label, current, accent, icon: Box | null }] }      Box = { x, y, r, b, w, h }
//   chromeBudget: { innerHeight, boxes: [{ sel, y, b }] }                                           horizontal bars, clipped to the viewport
//   safeGutters:  { innerWidth, left, right, boxes: [{ sel, x, r }] }
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
  SCENARIOS: { name: string; route: string; start?: string; widths?: (number | string)[]; rules?: string[]; setup?: string }[]
  evaluateMetrics: (m: unknown, c: Ctx) => Finding[]
}
interface Ctx { width: number; route: string; kind: string }
interface Finding { rule: string; message: string }

const base = (vw: number) => ({ vw, scrollW: vw, clientW: vw, over: [], content: { x: 24, r: vw - 24 }, railR: 0, container: { x: 24, r: vw - 24 }, pageWidthAttr: 'default', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [] })
const run = (extra: Record<string, unknown>, rule: string, width = 375) => api.evaluateMetrics({ ...base(width), ...extra }, { width, route: '/', kind: 'default' }).filter((f) => f.rule === rule)

const box = (x: number, y: number, w: number, h: number) => ({ x, y, r: x + w, b: y + h, w, h })

describe('P31: a bottom-bar squircle that is not square, or not 6 px inside the bar (R-F)', () => {
  // The bar at 375 px: x 4-371, y 585-655 (70 tall, 8 px clear of a 667 px viewport's bottom is not the point). Squircles are 40 px.
  const bar = box(4, 585, 367, 70)
  const link = (label: string, over: Partial<{ current: boolean; accent: boolean; icon: ReturnType<typeof box> | null }> = {}) => ({
    label, current: false, accent: false, icon: box(30, 600, 40, 40), ...over,
  })
  const links = (cur: ReturnType<typeof link>, scan: ReturnType<typeof link>) => [link('Today'), cur, scan, link('Shop')]

  it('is active and always fails (plan section 9)', () => {
    expect(api.RULES.map((r) => r.id)).toContain('P31')
    expect(api.ALWAYS_FAIL).toContain('P31')
  })

  it('passes squircles of 40 x 40 that sit 15 px from the top of the bar (the 375 px look) and 8.5 px (labelled)', () => {
    const cur = link('Plan', { current: true, icon: box(60, 600, 40, 40) })
    const scan = link('Scan', { accent: true, icon: box(167, 600, 40, 40) })
    expect(run({ barSquircles: { bar, links: links(cur, scan) } }, 'P31')).toEqual([])
    const labelled = { bar: box(12, 585, 366, 70), links: links(link('Plan', { current: true, icon: box(70, 593.5, 40, 40) }), link('Scan', { accent: true, icon: box(175, 593.5, 40, 40) })) }
    expect(run({ barSquircles: labelled }, 'P31', 390)).toEqual([])
  })

  it('reports a highlight that is not square, with the plan message (the beta.8 look: 44.9 x 54)', () => {
    const cur = link('Plan', { current: true, icon: box(60, 596, 44.9, 54) })
    const f = run({ barSquircles: { bar, links: links(cur, link('Scan', { accent: true, icon: box(167, 600, 40, 40) })) } }, 'P31')
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toBe(
      'P31 .bottom-bar__link "Plan" .bottom-bar__icon is 44.9x54 px at 56/5 px inside the bar; the bar\'s highlight and Scan are 40 px squircles inside the bar (system.md 8)',
    )
  })

  it('reports Scan when its squircle is not 6 px inside the bar (a 58 px Scan that pokes out at the top)', () => {
    const scan = link('Scan', { accent: true, icon: box(167, 580, 40, 40) })
    const f = run({ barSquircles: { bar, links: links(link('Plan', { current: true }), scan) } }, 'P31')
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toContain('"Scan"')
    expect(f[0]!.message).toMatch(/is 40x40 px at 163\/-5 px inside the bar/) // dx/dy are in the message, a negative dy is a box poking out
  })

  it('a squircle 5.9 px from the bar edge fails, 6 px passes, and a side edge counts as well as the top and bottom', () => {
    const near = link('Plan', { current: true, icon: box(9.9, 600, 40, 40) }) // 5.9 px from the bar's left edge
    expect(run({ barSquircles: { bar, links: links(near, link('Scan', { accent: true })) } }, 'P31')).toHaveLength(1)
    const ok = link('Plan', { current: true, icon: box(10, 600, 40, 40) })
    expect(run({ barSquircles: { bar, links: links(ok, link('Scan', { accent: true })) } }, 'P31')).toEqual([])
  })

  it('a current or Scan link without the .bottom-bar__icon span is a finding (the markup of R-F is missing)', () => {
    const f = run({ barSquircles: { bar, links: links(link('Plan', { current: true, icon: null }), link('Scan', { accent: true })) } }, 'P31')
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toContain('has no .bottom-bar__icon')
  })

  it('judges only the current link and Scan: the bare icons of the other destinations are not squircles', () => {
    const odd = link('Today', { icon: box(30, 590, 24, 24) })
    expect(run({ barSquircles: { bar, links: [odd, link('Plan', { current: true }), link('Scan', { accent: true })] } }, 'P31')).toEqual([])
  })

  it('reads nothing it has not been given: no bar (from 1024), the resize walk and older probes', () => {
    expect(run({ barSquircles: null }, 'P31', 1440)).toEqual([])
    expect(run({}, 'P31')).toEqual([])
  })

  it('has its probe, key barSquircles, on the bottom-bar scenario only, reading .bottom-bar__icon', () => {
    const probe = api.PROBES.find((p) => p.name === 'bottom-bar-squircles')
    expect(probe?.key).toBe('barSquircles')
    expect(probe?.scenarios).toEqual(['bottom-bar'])
    expect(probe?.source).toContain('.bottom-bar__icon')
  })

  it('Scenario: At 375 and 390 px every bottom-bar destination keeps its squircle inside the bar: bottom-bar opens / and runs P31 only (430 joins when the shared viewport table has it)', () => {
    const s = api.SCENARIOS.find((x) => x.name === 'bottom-bar')
    expect(s).toMatchObject({ route: '/', start: '/', rules: ['P31'] })
    expect(s?.widths).toEqual(expect.arrayContaining([375, 390]))
    expect(s?.widths?.every((w) => typeof w === 'number' ? w >= 375 : true)).toBe(true)
  })
})

describe('P32: fixed and sticky chrome covers more than 35 % of the viewport height at load (SHORT-04)', () => {
  const budget = (innerHeight: number, boxes: { sel: string; y: number; b: number }[]) => ({ chromeBudget: { innerHeight, boxes } })
  it('is active and by mode, not always-fail (plan section 9, until B9-55)', () => {
    expect(api.RULES.find((r) => r.id === 'P32')?.always).toBe(false)
    expect(api.ALWAYS_FAIL).not.toContain('P32')
  })

  it('reports the beta.8 Recipe detail at 844x390: a 88 px Cook bar and the 70 px bottom bar, 41 %', () => {
    const f = run(budget(390, [{ sel: 'div.sticky-action-bar', y: 208, b: 296 }, { sel: 'nav.bottom-bar', y: 308, b: 378 }]), 'P32', 844)
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toBe('P32 fixed and sticky chrome covers 41 % of the viewport height at load (158 of 390 px: div.sticky-action-bar, nav.bottom-bar); the limit is 35 % (system.md 11)')
  })

  it('counts overlapping boxes once (the union of their heights)', () => {
    // 252-340 and 308-378 overlap on 308-340: the union is 126 px, 32 % of 390: fine (counted twice it would be 158 px, 41 %)
    expect(run(budget(390, [{ sel: 'a', y: 252, b: 340 }, { sel: 'b', y: 308, b: 378 }]), 'P32', 844)).toEqual([])
  })

  it('passes the after of SHORT-04: a 62 px Save bar alone at 667x375 (16 %), nothing at 375x256', () => {
    expect(run(budget(375, [{ sel: 'div.sticky-action-bar', y: 301, b: 363 }]), 'P32', 667)).toEqual([])
    expect(run(budget(256, []), 'P32', 375)).toEqual([])
  })

  it('35 % exactly passes, one pixel more fails', () => {
    expect(run(budget(400, [{ sel: 'a', y: 0, b: 140 }]), 'P32')).toEqual([])
    expect(run(budget(400, [{ sel: 'a', y: 0, b: 141 }]), 'P32')).toHaveLength(1)
  })

  it('reads nothing it has not been given', () => {
    expect(run({}, 'P32')).toEqual([])
    expect(run({ chromeBudget: null }, 'P32')).toEqual([])
  })

  it('has its probe, key chromeBudget, on the chrome scenarios only; a rail (taller than wide) is not horizontal chrome', () => {
    const probe = api.PROBES.find((p) => p.name === 'chrome-budget')
    expect(probe?.key).toBe('chromeBudget')
    expect(probe?.scenarios).toEqual(expect.arrayContaining(['chrome-landscape', 'chrome-landscape-editor', 'chrome-zoom-editor']))
    expect(probe?.source).toMatch(/fixed/)
    expect(probe?.source).toMatch(/sticky/)
    expect(probe?.source).toMatch(/dialog/)
  })

  it.each([
    ['chrome-landscape', '/', ['667x375']],
    ['chrome-landscape-editor', '/recipes/:id/edit', ['667x375']],
    ['chrome-landscape-detail', '/recipes/:id', ['667x375']],
    ['chrome-zoom-editor', '/recipes/:id/edit', ['375x256']],
    ['chrome-zoom-detail', '/recipes/:id', ['375x256']],
  ])('Scenario %s runs P32 only on %s at %j', (name, route, widths) => {
    const s = api.SCENARIOS.find((x) => x.name === name)
    expect(s).toMatchObject({ route, start: route, rules: ['P32'], widths })
  })
})

describe('P35: content inside a safe-area inset (SHORT-05)', () => {
  const gutters = (boxes: { sel: string; x: number; r: number }[], left = 47, right = 47) => ({ safeGutters: { innerWidth: 844, left, right, boxes } })
  it('is active and always fails (plan section 9)', () => {
    expect(api.RULES.map((r) => r.id)).toContain('P35')
    expect(api.ALWAYS_FAIL).toContain('P35')
  })

  it('reports the beta.8 Today at 844x390 with 47 px insets: the title at x 24 and the avatar ending at x 820', () => {
    const f = run(gutters([{ sel: 'h1.page-header__title', x: 24, r: 300 }, { sel: 'button.your-menu-button', x: 780, r: 820 }]), 'P35', 844)
    expect(f).toHaveLength(2)
    expect(f[0]!.message).toBe('P35 h1.page-header__title starts at x 24, 23 px inside the left inset (47 px); every gutter is max(gutter, inset) on its side (system.md 11.5)')
    expect(f[1]!.message).toBe('P35 button.your-menu-button ends at x 820, 23 px inside the right inset (47 px); every gutter is max(gutter, inset) on its side (system.md 11.5)')
  })

  it('passes the after: the page runs x 135-797 beside the 64 px rail, the avatar ends at x 797', () => {
    expect(run(gutters([{ sel: 'h1', x: 135, r: 400 }, { sel: 'button', x: 757, r: 797 }]), 'P35', 844)).toEqual([])
  })

  it('a box exactly at the inset passes', () => {
    expect(run(gutters([{ sel: 'h1', x: 47, r: 797 }]), 'P35', 844)).toEqual([])
  })

  it('with no inset (a phone without a notch) nothing is reported', () => {
    expect(run(gutters([{ sel: 'h1', x: 0, r: 844 }], 0, 0), 'P35', 844)).toEqual([])
  })

  it('reads nothing it has not been given', () => {
    expect(run({}, 'P35', 844)).toEqual([])
  })

  it('has its probe, key safeGutters, on the safe-gutters scenarios only', () => {
    const probe = api.PROBES.find((p) => p.name === 'safe-gutters')
    expect(probe?.key).toBe('safeGutters')
    expect(probe?.scenarios).toEqual(['safe-gutters-today', 'safe-gutters-shop'])
    expect(probe?.source).toContain('safe-area-inset')
  })

  it.each([
    ['safe-gutters-today', '/'],
    ['safe-gutters-shop', '/shop'],
  ])('Scenario: In landscape on a notched phone the page title starts clear of the notch: %s opens %s at 844x390-inset and runs P35 only', (name, route) => {
    expect(api.SCENARIOS.find((x) => x.name === name)).toMatchObject({ route, start: route, widths: ['844x390-inset'], rules: ['P35'] })
  })
})

describe('no B9-19 scenario runs narrower than 375 px (amendment A1, the user\'s rule)', () => {
  it('every scenario of this package uses a viewport of 375 px or more in width', () => {
    const mine = api.SCENARIOS.filter((s) => /^(bottom-bar|chrome-|safe-gutters)/.test(s.name))
    expect(mine.length).toBeGreaterThanOrEqual(8)
    for (const s of mine) for (const w of s.widths ?? []) expect(typeof w === 'number' ? w : Number(String(w).split('x')[0]), s.name).toBeGreaterThanOrEqual(375)
  })
})
