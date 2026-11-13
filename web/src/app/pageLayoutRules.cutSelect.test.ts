// pantry-filter review: rule P22 of the page-layout guard. The Pantry's Sort chip read "G…" (then "Good u…" from 360 to 397 px) and
// no rule saw it: P16 reads only .chip labels, and nothing overflowed. A chip Select (a toolbar picker: Sort) is sized by its value,
// so a cut value is a finding that fails in every mode; the guard reads it on every probe and on each width of the phone walk.
// In a browser: scripts/test/page-layout-recipes-header_test.sh (sort-cut.html is cut at 390 px; fixed.html is clean).
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()

type Finding = { rule: string; message: string }
const rules = createRequire(resolve(cwd, 'package.json'))(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  ALWAYS_FAIL: string[]
  evaluateMetrics: (m: Record<string, unknown>, ctx: { width: number; route: string; kind: string }) => Finding[]
  resizeWalkFindings: (errors: unknown[], ctx: { width: number; route: string }, cutSelects?: unknown[]) => Finding[]
}
const driver = readFileSync(resolve(cwd, '../scripts/check-page-layout.mjs'), 'utf8')

const base = (vw: number) => ({
  vw, scrollW: vw, clientW: vw, over: [], content: { x: 16, r: vw - 16 }, railR: 0, container: { x: 16, r: vw - 16 },
  pageWidthAttr: 'default', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [],
})
const run = (extra: Record<string, unknown>, width = 390) =>
  rules.evaluateMetrics({ ...base(width), ...extra }, { width, route: '/pantry?status=useSoon&place=10', kind: 'default' })
// What the probe reported for the author's first build at 390 px: "Good until" (72 px) in 7 px, shown as "G…".
const goodUntilCut = { sel: 'button.select__trigger', label: 'Good until', shown: 7, px: 65 }

describe('P22: a chip Select cuts its value', () => {
  it('is in ALWAYS_FAIL (it fails on warn routes too)', () => {
    expect(rules.ALWAYS_FAIL).toContain('P22')
  })
  it('the "G…" Sort is a finding naming the trigger, the value, what shows and what is cut', () => {
    const p = run({ cutSelects: [goodUntilCut] }).find((f) => f.rule === 'P22')
    expect(p?.message).toMatch(/^P22 /)
    expect(p?.message).toMatch(/select__trigger/)
    expect(p?.message).toMatch(/"Good until"/)
    expect(p?.message).toMatch(/shows 7 px/)
    expect(p?.message).toMatch(/cuts 65 px/)
  })
  it('so is "Good u…" (1 px is enough: the ellipsis hides the rest)', () => {
    expect(run({ cutSelects: [{ ...goodUntilCut, shown: 65, px: 7 }] }).map((f) => f.rule)).toContain('P22')
    expect(run({ cutSelects: [{ ...goodUntilCut, shown: 71, px: 1 }] }).map((f) => f.rule)).toContain('P22')
  })
  it('one finding per cut Select', () => {
    expect(run({ cutSelects: [goodUntilCut, { ...goodUntilCut, label: 'Name' }] }).filter((f) => f.rule === 'P22')).toHaveLength(2)
  })
  it('none (or no probe) is clean', () => {
    expect(run({ cutSelects: [] }).map((f) => f.rule)).not.toContain('P22')
    expect(run({}).map((f) => f.rule)).not.toContain('P22')
  })
})

describe('the walk reads P22 as well as P21', () => {
  it('a cut Sort at a walked width is a P22 finding', () => {
    expect(rules.resizeWalkFindings([], { width: 360, route: '/pantry' }, [goodUntilCut]).map((f) => f.rule)).toEqual(['P22'])
  })
  it('runtime errors stay P21, and a walk without the probe is read as before', () => {
    const errors = [{ why: 'console', text: 'boom' }]
    expect(rules.resizeWalkFindings(errors, { width: 360, route: '/pantry' }).map((f) => f.rule)).toEqual(['P21'])
    expect(rules.resizeWalkFindings([], { width: 360, route: '/pantry' })).toEqual([])
  })
})

describe('the driver', () => {
  it('probes the value of every chip Select in <main>, by its scroll overflow and its text\'s laid-out width', () => {
    expect(driver).toMatch(/const cutSelectProbe = /)
    expect(driver).toMatch(/\.select__trigger\[data-appearance="chip"\] \.select__value/)
    expect(driver).toMatch(/v\.scrollWidth - v\.clientWidth/)
    expect(driver).toMatch(/createRange\(\)/)
  })
  it('collects it on every probe and on each width of the walk', () => {
    expect(driver).toMatch(/cutSelects: await evaluate\(cutSelectProbe\)/)
    expect(driver).toMatch(/resizeWalkFindings\(runtimeErrors, \{ width: w, route \}, cutSelects\)/)
  })
})
