// B9-18 (SSP-12, SAFE R1; plan section 9): page-layout rule P43, always fails, with its probe and scenarios. The files:
//   scripts/lib/page-layout/rules/P43-toast-cover.mjs      P43: a toast covers the row being acted on, the bottom bar or a sticky bar
//   scripts/lib/page-layout/probes/toast-cover.mjs         key toastCover, scenarios ['toast-pricing', 'toast-over-bar']
//   scripts/lib/page-layout/scenarios/b9-18.mjs            order 320: toast-pricing, toast-over-bar (rules: ['P43'])
// Metrics shape (what the probe fills, what the rule reads):
//   toastCover: { toasts: [{ sel, box }], targets: [{ kind: 'pricing' | 'focused-row' | 'bottom-bar' | 'sticky-bar', sel, box }] }
//   Box = { x, y, r, b } in px. A toast "covers" a target when the boxes overlap by more than 1 px in both directions (touching or
//   sharing an edge is clear). One finding per (toast, target) pair, whose message names the kind, the target and the overlap in px.
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
  SCENARIOS: { name: string; route: string; start?: string; setup?: string; widths?: (number | string)[]; rules?: string[] }[]
  evaluateMetrics: (m: unknown, c: Ctx) => Finding[]
}
interface Ctx { width: number; route: string; kind: string }
interface Finding { rule: string; message: string }

const base = (vw: number) => ({ vw, scrollW: vw, clientW: vw, over: [], content: { x: 24, r: vw - 24 }, railR: 0, container: { x: 24, r: vw - 24 }, pageWidthAttr: 'wide', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [] })
const run = (toastCover: unknown, width = 390) => api.evaluateMetrics({ ...base(width), toastCover }, { width, route: '/scan', kind: 'phone' }).filter((f) => f.rule === 'P43')
const box = (x: number, y: number, r: number, b: number) => ({ x, y, r, b })
const toast = (b: ReturnType<typeof box>) => ({ sel: '.toast', box: b })
const target = (kind: string, b: ReturnType<typeof box>, sel = '.list-row') => ({ kind, sel, box: b })

describe('P43: a toast covers the row being acted on (SSP-12)', () => {
  it('is registered by B9-18 and always fails (plan section 9)', () => {
    const rule = api.RULES.find((r) => r.id === 'P43')
    expect(rule).toBeDefined()
    expect(rule!.always).toBe(true)
    expect(api.ALWAYS_FAIL).toContain('P43')
    expect(rule!.title).toMatch(/toast covers/i)
  })

  it('the keypad case: a toast over the [data-pricing] row is a finding that names the row and the overlap', () => {
    const f = run({ toasts: [toast(box(20, 284, 370, 344))], targets: [target('pricing', box(16, 284, 374, 356), '[data-pricing]')] })
    expect(f).toHaveLength(1)
    expect(f[0]!.message).toMatch(/^P43 /)
    expect(f[0]!.message).toContain('[data-pricing]')
    expect(f[0]!.message).toMatch(/pricing/)
    expect(f[0]!.message).toMatch(/60 px/) // overlap height
  })

  it('a toast above the priced row, or below it, is clear', () => {
    expect(run({ toasts: [toast(box(20, 200, 370, 260))], targets: [target('pricing', box(16, 284, 374, 356), '[data-pricing]')] })).toEqual([])
    expect(run({ toasts: [toast(box(20, 380, 370, 440))], targets: [target('pricing', box(16, 284, 374, 356), '[data-pricing]')] })).toEqual([])
  })

  it('touching an edge is clear; overlapping by 2 px is not', () => {
    expect(run({ toasts: [toast(box(20, 300, 370, 360))], targets: [target('focused-row', box(16, 240, 374, 300))] })).toEqual([])
    expect(run({ toasts: [toast(box(20, 298, 370, 360))], targets: [target('focused-row', box(16, 240, 374, 300))] })).toHaveLength(1)
  })

  it('the bottom bar (the Scan button lives in it) and a sticky Save bar count as covered too', () => {
    const t = toast(box(20, 700, 370, 760))
    expect(run({ toasts: [t], targets: [target('bottom-bar', box(12, 740, 378, 800), '.bottom-nav')] })).toHaveLength(1)
    expect(run({ toasts: [t], targets: [target('sticky-bar', box(12, 720, 378, 790), '.sticky-action-bar')] })).toHaveLength(1)
    expect(run({ toasts: [t], targets: [target('bottom-bar', box(12, 770, 378, 830), '.bottom-nav')] })).toEqual([])
  })

  it('one finding per toast and target pair', () => {
    const f = run({
      toasts: [toast(box(20, 300, 370, 360)), toast(box(20, 360, 370, 420))],
      targets: [target('focused-row', box(16, 320, 374, 380)), target('bottom-bar', box(12, 400, 378, 460), '.bottom-nav')],
    })
    expect(f).toHaveLength(3) // first toast × row, second toast × row, second toast × bar
  })

  it('no toast on screen, nothing measured, or the metric absent: no findings', () => {
    expect(run({ toasts: [], targets: [target('pricing', box(0, 0, 100, 100))] })).toEqual([])
    expect(run({ toasts: [], targets: [] })).toEqual([])
    expect(api.evaluateMetrics({ ...base(390) }, { width: 390, route: '/', kind: 'phone' }).filter((f) => f.rule === 'P43')).toEqual([])
  })
})

describe('the probe and the scenarios', () => {
  it('the probe toast-cover fills toastCover, only on the two toast scenarios', () => {
    const p = api.PROBES.find((x) => x.name === 'toast-cover')
    expect(p).toBeDefined()
    expect(p!.key).toBe('toastCover')
    expect(p!.scenarios).toEqual(['toast-pricing', 'toast-over-bar'])
    expect(p!.source).toContain('[data-pricing]')
    expect(p!.source).toContain('.toast')
  })

  it('toast-pricing is /scan at 375, 390 and 834 and reports only P43', () => {
    const s = api.SCENARIOS.find((x) => x.name === 'toast-pricing')!
    expect(s).toMatchObject({ route: '/scan', start: '/scan', setup: 'toastPricing', rules: ['P43'] })
    expect(s.widths).toEqual([375, 390, 834])
  })

  it('toast-over-bar is /scan at 375, 390 and 834 and reports only P43', () => {
    const s = api.SCENARIOS.find((x) => x.name === 'toast-over-bar')!
    expect(s).toMatchObject({ route: '/scan', start: '/scan', setup: 'toastOverBar', rules: ['P43'] })
    expect(s.widths).toEqual([375, 390, 834])
  })
})
