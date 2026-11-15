// w2c (B9-19 integration): with the compact rail, 844x390 opens the Filters as SHORT-02's 640 px centred dialog with SHORT-07's two
// columns. P8 allows 640 px under 500 px tall (600 px otherwise), and the filter-spacing probe measures only sections stacked in one
// column (side-by-side sections have no vertical gap).
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const req = createRequire(resolve(cwd, 'package.json'))
const api = req(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  PROBES: { name: string; source: string }[]
  evaluateMetrics: (m: unknown, c: { width: number; route: string; kind: string }) => { rule: string; message: string }[]
}
const base = (vw: number) => ({ vw, scrollW: vw, clientW: vw, over: [], content: { x: 24, r: vw - 24 }, railR: 0, container: { x: 24, r: vw - 24 }, pageWidthAttr: 'default', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [] })
const p8 = (dialog: Record<string, number>, width: number) => api.evaluateMetrics({ ...base(width), dialog }, { width, route: '/recipes', kind: 'default' }).filter((f) => f.rule === 'P8')

describe('P8 on a short viewport (SHORT-02)', () => {
  it('a centred 640 px dialog passes under 500 px tall', () => expect(p8({ x: 102, w: 640, vw: 844, vh: 390 }, 844)).toEqual([]))
  it('a 640 px dialog still fails on a tall viewport, and so does an off-centre one on a short viewport', () => {
    expect(p8({ x: 102, w: 640, vw: 844, vh: 1194 }, 844)).toHaveLength(1)
    expect(p8({ x: 60, w: 640, vw: 844, vh: 390 }, 844)).toHaveLength(1)
    expect(p8({ x: 102, w: 660, vw: 844, vh: 390 }, 844)).toHaveLength(1)
  })
  it('the dialog probe reports the viewport height', () => expect(api.PROBES.find((p) => p.name === 'dialog')!.source).toMatch(/vh: innerHeight/))
})

describe('filter-spacing probe (P20): only stacked sections', () => {
  it('compares sections that overlap horizontally, never two columns side by side', () => {
    const src = api.PROBES.find((p) => p.name === 'filter-spacing')!.source
    expect(src).toMatch(/Math\.min\(a\.right, b\.right\) - Math\.max\(a\.left, b\.left\) > 1/)
  })
})
