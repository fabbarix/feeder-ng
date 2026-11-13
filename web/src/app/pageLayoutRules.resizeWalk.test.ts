// hf-recipes-filter round 3: rule P21 of the page-layout guard. The round-2 chip line looped at 430 px on the guard's own filtered
// /recipes scenario (React #185, the "Something went wrong" page), between the guard's widths 390 and 834. So the guard walks
// that scenario through phone widths, 360 to 480 px in 10 px steps, loading it fresh at each, and a console error, an uncaught
// exception or the error page there is a finding that fails in every mode (docs/design/recipes-filter.md 14).
// In a browser: scripts/test/page-layout-recipes-header_test.sh (round1.html breaks between 420 and 440 px).
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()

const rules = createRequire(resolve(cwd, 'package.json'))(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  ALWAYS_FAIL: string[]
  SCENARIOS: { name: string }[]
  RESIZE_WALK?: { scenario: string; from: number; to: number; step: number }
  resizeWalkWidths?: () => number[]
  evaluateMetrics: (m: Record<string, unknown>, ctx: { width: number; route: string; kind: string }) => { rule: string; message: string }[]
}
const driver = readFileSync(resolve(cwd, '../scripts/check-page-layout.mjs'), 'utf8')

const base = (vw: number) => ({
  vw, scrollW: vw, clientW: vw, over: [], content: { x: 16, r: vw - 16 }, railR: 0, container: { x: 16, r: vw - 16 },
  pageWidthAttr: 'wide', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [],
})
const run = (extra: Record<string, unknown>, width = 430) =>
  rules.evaluateMetrics({ ...base(width), ...extra }, { width, route: '/recipes?course=2&tag=x', kind: 'wide' })

describe('RESIZE_WALK', () => {
  it('walks the closed filtered /recipes scenario from 360 to 480 px in 10 px steps', () => {
    expect(rules.RESIZE_WALK).toEqual({ scenario: 'recipes-filtered', from: 360, to: 480, step: 10 })
    expect(rules.SCENARIOS.map((s) => s.name)).toContain(rules.RESIZE_WALK?.scenario)
  })
  it('resizeWalkWidths lists the 13 widths', () => {
    expect(rules.resizeWalkWidths?.()).toEqual([360, 370, 380, 390, 400, 410, 420, 430, 440, 450, 460, 470, 480])
  })
})

describe('P21: the page broke at a width', () => {
  it('is in ALWAYS_FAIL', () => {
    expect(rules.ALWAYS_FAIL).toContain('P21')
  })
  it('an uncaught exception is a finding quoting it', () => {
    const p = run({ runtimeErrors: [{ why: 'exception', text: 'Minified React error #185' }] }).find((x) => x.rule === 'P21')
    expect(p?.message).toMatch(/^P21 /)
    expect(p?.message).toMatch(/exception/)
    expect(p?.message).toMatch(/#185/)
  })
  it('a console error and the error page are findings too', () => {
    const f = run({ runtimeErrors: [{ why: 'console', text: 'Maximum update depth exceeded' }, { why: 'error-page', text: 'Something went wrong' }] })
    expect(f.filter((x) => x.rule === 'P21')).toHaveLength(2)
  })
  it('none (or no probe) is clean', () => {
    expect(run({ runtimeErrors: [] }).map((x) => x.rule)).not.toContain('P21')
    expect(run({}).map((x) => x.rule)).not.toContain('P21')
  })
})

describe('the driver', () => {
  it('runs the walk, loading the scenario fresh at each width', () => {
    expect(driver).toMatch(/RESIZE_WALK|resizeWalkWidths/)
  })
  it('listens for uncaught exceptions and console errors, and looks for the error page', () => {
    expect(driver).toMatch(/Runtime\.exceptionThrown/)
    expect(driver).toMatch(/Runtime\.consoleAPICalled|Log\.entryAdded/)
    expect(driver).toMatch(/Something went wrong/)
    expect(driver).toMatch(/runtimeErrors\s*[,:=]/)
  })
})
