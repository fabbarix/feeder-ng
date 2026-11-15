// B9-29 (SSP-03, SSP-05, SSP-10, DS-03; plan section 9): the page-layout guard's side of the Pantry package. The files:
//   scripts/lib/page-layout/scenarios/b9-29.mjs        order 330: pantry-put-away, meta-fit-pantry, meta-fit-supplies, text-spacing-pantry
//   scripts/lib/page-layout/probes/cut-meta.mjs        P23's probe now reads every visible `.list-row__meta-text` (was: the Shop's info hints only)
//   scripts/check-page-layout.modes.d/20-b9-13-p40-p41-warn   loses `P41@/pantry` (the Storage Place groups have visible titles); P40's lines stay
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { readFileSync, existsSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string; existsSync: (p: string) => boolean }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const req = createRequire(resolve(cwd, 'package.json'))
const api = req(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  SCENARIOS: { name: string; route: string; start?: string; widths?: (number | string)[]; rules?: string[]; setup?: string }[]
  SETUPS: Record<string, unknown>
  PROBES: { name: string; key: string | null; source: string }[]
  evaluateMetrics: (m: unknown, c: { width: number; route: string; kind: string }) => { rule: string; message: string }[]
}
const read = (p: string) => readFileSync(resolve(cwd, '..', p), 'utf8')
const scenario = (name: string) => api.SCENARIOS.find((s) => s.name === name)

describe('B9-29 scenarios', () => {
  it('pantry-put-away opens the Put away sheet on /pantry at 375, 390 and 1440 and judges the footer (P12), the targets (P25), the body (P33) and sideways scroll (P1)', () => {
    const s = scenario('pantry-put-away')
    expect(s).toBeDefined()
    expect(s).toMatchObject({ route: '/pantry', start: '/pantry', setup: 'pantryPutAway', widths: [375, 390, 1440], rules: ['P1', 'P12', 'P25', 'P33'] })
    expect(typeof api.SETUPS.pantryPutAway).toBe('function')
  })
  it('its setup only ticks: it never presses a Move (the seed\'s Not sorted Lots stay for the other scenarios)', () => {
    const src = read('scripts/lib/page-layout/scenarios/b9-29.mjs')
    expect(src).toMatch(/Put away/)
    expect(src).not.toMatch(/press\([^)]*Move/)
  })
  it('text-spacing-pantry injects the 1.4.12 spacing on /pantry at 390 and checks P1 and P22', () => {
    expect(scenario('text-spacing-pantry')).toMatchObject({ route: '/pantry', widths: [390], rules: ['P1', 'P22'], setup: 'textSpacing' })
    const src = read('scripts/lib/page-layout/scenarios/b9-29.mjs')
    for (const part of ['line-height: 1.5', 'letter-spacing: 0.12em', 'word-spacing: 0.16em']) expect(src).toContain(part)
  })
  it('the scenario viewports gain 1120x800 (a desktop, not a phone)', () => {
    expect((api as unknown as { SCENARIO_VIEWPORTS: Record<string, unknown> }).SCENARIO_VIEWPORTS['1120']).toEqual({ width: 1120, height: 800, mobile: false })
  })
  it('P23 runs on /pantry and /supplies at 375, 390 and 1120 (a narrow row on a wide screen)', () => {
    expect(scenario('meta-fit-pantry')).toMatchObject({ route: '/pantry', widths: [375, 390, 1120], rules: ['P23'] })
    expect(scenario('meta-fit-supplies')).toMatchObject({ route: '/supplies', widths: [375, 390, 1120], rules: ['P23'] })
  })
})

describe('P23 reads every visible meta', () => {
  const probe = () => api.PROBES.find((p) => p.key === 'cutMeta')!
  it('the cut-meta probe no longer looks only inside .shop-lines', () => {
    expect(probe().source).toContain('.list-row__meta-text')
    expect(probe().source).not.toContain('.shop-lines')
    expect(probe().source).not.toContain('[data-status="info"]')
  })
  it('it still measures the painted form of a row that has a compact meta', () => {
    expect(probe().source).toContain('list-row__meta-compact')
  })
  it('it reports a cut Pantry status as a P23 finding', () => {
    const f = api.evaluateMetrics({ vw: 375, scrollW: 375, clientW: 375, over: [], content: { x: 16, r: 359 }, railR: 0, container: { x: 16, r: 359 }, pageWidthAttr: 'wide', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [], cutMeta: [{ sel: 'span.list-row__meta-text', label: 'Went off 14 days ago', shown: 120, px: 22 }] }, { width: 375, route: '/pantry', kind: 'narrow' }).filter((x) => x.rule === 'P23')
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toContain('Went off 14 days ago')
  })
})

describe('the mode lines', () => {
  const modes = () => read('scripts/check-page-layout.modes.d/20-b9-13-p40-p41-warn')
  it('P41 on /pantry is gone: the Storage Place groups have visible titles, so the route fails on P41 again', () => {
    expect(modes()).not.toMatch(/^P41@\/pantry/m)
  })
  it('the P40 lines of B9-51 stay', () => {
    expect(modes()).toMatch(/^P40@\/settings\/tags = warn until B9-51/m)
    expect(modes()).toMatch(/^P40@\/settings\/recipe-assistant = warn until B9-51/m)
  })
  it('/pantry is a fail route', () => {
    expect(read('scripts/check-page-layout.modes')).toMatch(/fail_routes=.*\s\/pantry(\s|$)/)
  })
  it('the guard has no other warn bridge that names /pantry', () => {
    for (const f of ['10-width-375-warn', '30-b9-w2a-warn']) {
      const p = `scripts/check-page-layout.modes.d/${f}`
      if (existsSync(resolve(cwd, '..', p))) expect(read(p)).not.toMatch(/@\/pantry/)
    }
  })
})
