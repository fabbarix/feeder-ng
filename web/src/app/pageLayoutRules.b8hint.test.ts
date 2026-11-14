// b8-hint (docs/dev/design/b8-hint.md): the shop-hints scenario measures the worst Shop hint on every day, not the hint of the
// day the guard runs ("Sat Breakfast +2" failed on a Saturday and passed on the Friday before with "Fri Dinner +2").
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()

interface Scenario { name: string; route: string; setup?: string; widths?: number[] }
const rules = createRequire(resolve(cwd, 'package.json'))(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as { SCENARIOS: Scenario[]; ALWAYS_FAIL: string[] }
const driver = readFileSync(resolve(cwd, '../scripts/check-page-layout.mjs'), 'utf8')
const setup = driver.slice(driver.indexOf('async shopHints()'), driver.indexOf('scanScannedList:'))

describe('shop-hints pins the hint to the worst case', () => {
  it('still runs at 360 px and P23 still always fails', () => {
    expect(rules.SCENARIOS.find((s) => s.name === 'shop-hints')?.widths).toEqual(expect.arrayContaining([360, 390]))
    expect(rules.ALWAYS_FAIL).toContain('P23')
  })
  it('the setup pins the hint (pinWorstHint) after waiting for a real one', () => {
    expect(setup).toMatch(/until\([\s\S]*list-row__meta\[data-status="info"\][\s\S]*pinWorstHint/)
  })
  it('the worst case spans the seven weekdays, the household Meal Slots and a two-digit count, measured in the meta font', () => {
    const pin = driver.slice(driver.indexOf('const PIN_WORST_HINT'), driver.indexOf('const SETUPS'))
    expect(pin).toMatch(/'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'/)
    expect(pin).toMatch(/\/api\/meal-slots/)
    expect(pin).toMatch(/measureText/)
    expect(pin).toMatch(/getComputedStyle\([^)]*\)\.font/)
    expect(pin).toMatch(/' \+12'/)
    // only food Lines: the Supplies group's Restock reason keeps its own text
    expect(pin).toMatch(/closest\('\.shop-supplies'\)/)
  })
})
