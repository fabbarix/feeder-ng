// hf-recipes-filter: rule P16 of the page-layout guard. A chip whose label is crushed (visible, cut by its ellipsis and narrower
// than 24 px while its text is longer) is a finding whether or not its line is full: the Recipes header showed every Tag as a dot
// with no name, in a full, sideways-scrolling row, which P1, P13 and P14 all let through (docs/design/recipes-filter.md 1, 11).
// jsdom cannot lay out, so the rule is tested on the probe's metrics here and in a browser by
// scripts/test/page-layout-recipes-header_test.sh (fixtures/page-layout-recipes-header).
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
  evaluateMetrics: (m: Record<string, unknown>, ctx: { width: number; route: string; kind: string }) => { rule: string; message: string }[]
}
const driver = readFileSync(resolve(cwd, '../scripts/check-page-layout.mjs'), 'utf8')

const base = (vw: number) => ({
  vw, scrollW: vw, clientW: vw, over: [], content: { x: 24, r: vw - 24 }, railR: 0, container: { x: 24, r: vw - 24 },
  pageWidthAttr: 'wide', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [],
})
const findings = (extra: Record<string, unknown>, width = 390) => rules.evaluateMetrics({ ...base(width), ...extra }, { width, route: '/recipes', kind: 'wide' })

describe('P16: a crushed chip label', () => {
  it('is a finding naming the chip, its label and the width it was left', () => {
    const f = findings({ crushedChips: [{ sel: 'button.chip', label: 'vegetarian', px: 0 }] })
    const p16 = f.find((x) => x.rule === 'P16')
    expect(p16?.message).toMatch(/^P16 /)
    expect(p16?.message).toMatch(/button\.chip/)
    expect(p16?.message).toMatch(/vegetarian/)
    expect(p16?.message).toMatch(/0\s*px/)
  })
  it('one finding per crushed chip', () => {
    const f = findings({ crushedChips: [{ sel: 'button.chip', label: 'fish', px: 4 }, { sel: 'button.chip', label: 'roast', px: 6 }] })
    expect(f.filter((x) => x.rule === 'P16')).toHaveLength(2)
  })
  it('none (or a probe older than the field) is clean', () => {
    expect(findings({ crushedChips: [] }).map((x) => x.rule)).not.toContain('P16')
    expect(findings({}).map((x) => x.rule)).not.toContain('P16')
  })
  it('fails in every mode, on warn routes too, like horizontal overflow', () => {
    expect(rules.ALWAYS_FAIL).toContain('P16')
  })
})

describe('the driver probe', () => {
  it('collects crushedChips: visible .chip labels cut by an ellipsis to under 24 px', () => {
    expect(driver).toMatch(/crushedChips/)
    expect(driver).toMatch(/clientWidth\s*<\s*24/)
  })
  it('puts crushedChips in the metrics it hands to evaluateMetrics', () => {
    expect(driver).toMatch(/crushedChips\s*[,:=]/)
  })
})
