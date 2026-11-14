// b8-polish (docs/dev/design/b8-polish.md 2): P23 covers the Shop's Supplies group again. The Restock reason ("400/1000 ml" on a
// phone) is read by the same probe as the Meal Slot hint, and the scenarios that run it include 360 px, where it was cut by 3 px.
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()

interface Scenario { name: string; route: string; setup?: string; widths?: number[] }
const rules = createRequire(resolve(cwd, 'package.json'))(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as { SCENARIOS: Scenario[] }
const driver = readFileSync(resolve(cwd, '../scripts/check-page-layout.mjs'), 'utf8')
const byName = (n: string) => rules.SCENARIOS.find((s) => s.name === n)

describe('P23 reads the Supplies group again', () => {
  it('the probe no longer skips .shop-supplies', () => {
    expect(driver).not.toMatch(/closest\('\.shop-supplies'\)/)
    expect(driver).not.toMatch(/waits for a design decision/)
  })
  it('the probe still reads the .shop-lines info metas, which include the Supplies group', () => {
    expect(driver).toMatch(/\.shop-lines \.list-row__meta\[data-status="info"\] \.list-row__meta-text/)
  })
  it('shop-supplies-group runs at 360 px and its setup waits for a Restock reason (an info meta in the group)', () => {
    expect(byName('shop-supplies-group')?.widths).toEqual(expect.arrayContaining([360, 390, 834, 1440]))
    expect(driver).toMatch(/\.shop-supplies \.list-row__meta\[data-status="info"\]/)
  })
  it('shop-hints also runs at 360 px', () => {
    expect(byName('shop-hints')?.widths).toEqual(expect.arrayContaining([360, 390, 834, 1440]))
  })
})
