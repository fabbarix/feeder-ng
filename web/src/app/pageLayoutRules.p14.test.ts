// ds-plan round 3: rule P14 of the page-layout guard. A chip whose label is cut by an ellipsis while its chip line still has room to
// spare is a finding (the Plan's "L…": every screen with chips is covered). A chip that is cut because the line is really full is fine.
// jsdom cannot lay anything out, so the rule is tested on the probe's metrics here and in a browser by
// scripts/test/page-layout-chips_test.sh (fixtures/page-layout-chips).
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const rules = createRequire(resolve(cwd, 'package.json'))(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  evaluateMetrics: (m: Record<string, unknown>, ctx: { width: number; route: string; kind: string }) => { rule: string; message: string }[]
}
const driver = readFileSync(resolve(cwd, '../scripts/check-page-layout.mjs'), 'utf8')

const base = (vw: number) => ({
  vw, scrollW: vw, clientW: vw, over: [], content: { x: 24, r: vw - 24 }, railR: 0, container: { x: 24, r: vw - 24 },
  pageWidthAttr: 'wide', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [],
})
const findings = (extra: Record<string, unknown>, width = 1024) => rules.evaluateMetrics({ ...base(width), ...extra }, { width, route: '/plan', kind: 'wide' })

describe('P14: a clipped chip label with room to spare', () => {
  it('is a finding naming the chip, its label and the spare room', () => {
    const f = findings({ clippedChips: [{ sel: 'span.chip', label: 'Leftover from Sat', room: 212 }] })
    const p14 = f.find((x) => x.rule === 'P14')
    expect(p14?.message).toMatch(/^P14 /)
    expect(p14?.message).toMatch(/span\.chip/)
    expect(p14?.message).toMatch(/Leftover from Sat/)
    expect(p14?.message).toMatch(/212\s*px/)
  })

  it('no clipped chip (or no probe result) is clean', () => {
    expect(findings({ clippedChips: [] }).map((x) => x.rule)).not.toContain('P14')
    expect(findings({}).map((x) => x.rule)).not.toContain('P14')
  })

  it('one finding per clipped chip', () => {
    const f = findings({ clippedChips: [{ sel: 'span.chip', label: 'A', room: 40 }, { sel: 'span.chip', label: 'B', room: 40 }] })
    expect(f.filter((x) => x.rule === 'P14')).toHaveLength(2)
  })
})

describe('the driver probe', () => {
  it('collects clippedChips: a .chip label whose scrollWidth exceeds its clientWidth while the chip line has spare room', () => {
    expect(driver).toMatch(/clippedChips/)
    expect(driver).toMatch(/chip__label/)
    expect(driver).toMatch(/scrollWidth\s*>\s*[a-zA-Z.]*clientWidth/)
  })

  it('puts clippedChips in the metrics it hands to evaluateMetrics', () => {
    expect(driver).toMatch(/clippedChips\s*[,:]/)
  })
})
