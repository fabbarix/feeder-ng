// B9-15 (DS-03, decision DS 6; plan section 9: "P22, revised by B9-15"): P22 changes from "a chip Select's value is cut" to "a chip Select's
// value is cut AND the chip is not icon-only". An icon-only chip passes only if its accessible name contains its value.
//   scripts/lib/page-layout/rules/P22-cut-select.mjs   the rule (still always fails)
//   scripts/lib/page-layout/probes/cut-selects.mjs     fills cutSelects: [{ sel, label, shown, px, iconOnly?, name? }]
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const api = createRequire(resolve(cwd, 'package.json'))(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  ALWAYS_FAIL: string[]
  PROBES: { name: string; key: string | null; source: string }[]
  evaluateMetrics: (m: unknown, c: { width: number; route: string; kind: string }) => { rule: string; message: string }[]
}
const base = (vw: number) => ({ vw, scrollW: vw, clientW: vw, over: [], content: { x: 16, r: vw - 16 }, railR: 0, container: { x: 16, r: vw - 16 }, pageWidthAttr: 'default', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [] })
const run = (cutSelects: unknown[]) => api.evaluateMetrics({ ...base(375), cutSelects }, { width: 375, route: '/pantry', kind: 'default' }).filter((f) => f.rule === 'P22')

const cut = { sel: 'button.select__trigger', label: 'Good until', shown: 36, px: 38 }

describe('P22 revised', () => {
  it('still always fails', () => {
    expect(api.ALWAYS_FAIL).toContain('P22')
  })
  it('a cut value on a chip that is not icon-only is a finding with the revised message', () => {
    const [f] = run([cut])
    expect(f?.message).toBe(
      'P22 button.select__trigger "Good until" shows 36 px and cuts 38 px of its value; a chip Select shows its value in full or, when it cannot, is icon-only with its value in its name (system.md 6)',
    )
  })
  it('an icon-only chip whose name contains its value passes', () => {
    expect(run([{ ...cut, shown: 0, px: 74, iconOnly: true, name: 'Sort: Good until' }])).toEqual([])
  })
  it('an icon-only chip whose name lacks its value is a finding that says so', () => {
    const [f] = run([{ ...cut, shown: 0, px: 74, iconOnly: true, name: 'Sort' }])
    expect(f?.rule).toBe('P22')
    expect(f?.message).toMatch(/"Good until"/)
    expect(f?.message).toMatch(/icon-only/)
    expect(f?.message).toMatch(/name/)
  })
  it('an icon-only chip with no name at all is a finding', () => {
    expect(run([{ ...cut, iconOnly: true }])).toHaveLength(1)
  })
  it('iconOnly: false is the same as absent', () => {
    expect(run([{ ...cut, iconOnly: false, name: 'Sort: Good until' }])).toHaveLength(1)
  })
  it('one finding per offending chip; a passing icon-only chip does not hide another chip\'s cut', () => {
    expect(run([{ ...cut, iconOnly: true, name: 'Sort: Good until' }, { ...cut, label: 'Any Shop' }])).toHaveLength(1)
  })
  it('none (or no probe) is clean', () => {
    expect(run([])).toEqual([])
    expect(api.evaluateMetrics({ ...base(375) }, { width: 375, route: '/pantry', kind: 'default' }).filter((f) => f.rule === 'P22')).toEqual([])
  })
})

describe('the cut-selects probe reads icon-only chips', () => {
  const probe = api.PROBES.find((p) => p.name === 'cut-selects')!
  it('keeps its key and still measures the chip values', () => {
    expect(probe.key).toBe('cutSelects')
    expect(probe.source).toMatch(/\.select__trigger\[data-appearance="chip"\] \.select__value/)
  })
  it('reports an icon-only trigger by its data-icon-only attribute with its accessible name (aria-label), and does not count its hidden value as cut', () => {
    expect(probe.source).toMatch(/data-icon-only/)
    expect(probe.source).toMatch(/aria-label/)
    expect(probe.source).toMatch(/iconOnly/)
  })
})
