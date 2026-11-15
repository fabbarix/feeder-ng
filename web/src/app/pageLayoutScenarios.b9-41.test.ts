// B9-41 (SSP-07, SSP-20, P41; plan section 9): the guard files of the Scan data are registered and read what the plan says.
//   scenarios/b9-41.mjs: scan-weighed (the weighed header, the keypad on per kg, the focused key's ring)
//   page-layout-seed/b9-41.mjs: a Weight Barcode Rule on the seeded Shop and a weighed barcode with an item code no Product has
//   the scenario files that read the Scanned list find it by its name, not by an aria-label (it has a visible title now)
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { readFileSync, readdirSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string; readdirSync: (p: string) => string[] }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const req = createRequire(resolve(cwd, 'package.json'))
const api = req(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  SCENARIOS: { name: string; route: string; start?: string; setup?: string; widths?: (number | string)[]; rules?: string[] }[]
}
const scenario = (name: string) => api.SCENARIOS.find((s) => s.name === name)
const scenarios = resolve(cwd, '../scripts/lib/page-layout/scenarios')

describe('B9-41 page-layout scenarios', () => {
  it('scan-weighed is a /scan scenario at 375, 390 and 834 with a setup that asserts what the plan lists (P12, P23 and P43 read the end state)', () => {
    const s = scenario('scan-weighed')
    expect(s).toBeDefined()
    expect(s!.route).toBe('/scan')
    expect(s!.widths).toEqual([375, 390, 834])
    expect(s!.rules).toEqual(['P12', 'P23', 'P43'])
    expect(s!.setup).toBeTruthy()
  })

  it('its setup checks the header line, the barcode line, the 14 digits, per kg, the header Close, the × line and the key ring', () => {
    const src = readFileSync(resolve(scenarios, 'b9-41.mjs'), 'utf8')
    for (const needle of ['weighed at', 'not in Feeder yet', 'per kg', '.sheet__header button', 'price-keypad__implied', 'price-keypad__key:focus-visible', 'outlineOffset']) expect(src, needle).toContain(needle)
    expect(src).toContain("ids.weighedBarcode")
  })

  it('the seed makes a Weight Barcode Rule on the first Shop and says the weighed barcode in the ids file', () => {
    const seed = readFileSync(resolve(cwd, '../scripts/test/fixtures/page-layout-seed/b9-41.mjs'), 'utf8')
    expect(seed).toMatch(/export const order = \d+/)
    expect(seed).toContain('/weight-rules')
    for (const key of ['weightRuleId', 'weighedBarcode']) expect(seed).toContain(key)
  })

  it('no scenario selects the Scanned list by aria-label: the list is named by its visible title now (the name is the same)', () => {
    const files = [...readdirSync(scenarios).map((n) => resolve(scenarios, n)), resolve(scenarios, '../helpers.mjs')]
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/ul\[aria-label=["']?Scanned list/)
  })
})
