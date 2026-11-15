// B9-50 (SSP-08, SSP-19, A11Y-09; plan section 9): the guard files of the receipt screens are registered and read what the plan says.
//   scenarios/b9-50.mjs: receipt-review-add and receipt-add-sheet (the review's Add… and its sheet), receipt-photos-bar (the first action and the photo row)
//   page-layout-seed/b9-50.mjs: a Product "Kitchen roll 4 pack" for the fake read's Kitchen roll line to match, its ids in the ids file
// The setups were loaded and syntax-checked, not run against a built app (the product code does not exist yet): the reviewer runs them once the
// developer is done.
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const req = createRequire(resolve(cwd, 'package.json'))
const api = req(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  SCENARIOS: { name: string; route: string; start?: string; setup?: string; widths?: (number | string)[]; rules?: string[]; emulate?: unknown[] }[]
}
const scenario = (name: string) => api.SCENARIOS.find((s) => s.name === name)
const src = readFileSync(resolve(cwd, '../scripts/lib/page-layout/scenarios/b9-50.mjs'), 'utf8')

describe('B9-50 page-layout scenarios', () => {
  it('receipt-review-add runs on the review at 375, 390, 834 and in a phone held sideways, with every rule', () => {
    const s = scenario('receipt-review-add')
    expect(s).toBeDefined()
    expect(s!.route).toBe('/scan/receipt/review')
    expect(s!.start).toBe('/scan')
    expect(s!.widths).toEqual([375, 390, 834, '667x375'])
    expect(s!.rules).toBeUndefined()
    expect(s!.setup).toBeTruthy()
  })
  it('its setup checks Accept all N, no checkbox and an "Add <line>" control of 40 px on a Not scanned row, the Product line, no cut title, one bar row and a focused Add… clear of the bar', () => {
    for (const needle of ['Accept all', 'input[type=checkbox]', 'aria-label', 'height < 40', 'is a Product', 'scrollWidth', 'ellipsis', 'break-all', '.focus()', 'sticky-action-bar'])
      expect(src, needle).toContain(needle)
    expect(src).toContain('ids.kitchenRollProductId')
  })
  it('receipt-add-sheet runs the sheet rules on a touch emulation at 375, 834 and 667x375', () => {
    const s = scenario('receipt-add-sheet')
    expect(s).toBeDefined()
    expect(s!.route).toBe('/scan/receipt/review')
    expect(s!.widths).toEqual([375, 834, '667x375'])
    expect(s!.rules).toEqual(['P1', 'P8', 'P18', 'P25', 'P33'])
    expect(s!.emulate?.length).toBeGreaterThan(0)
  })
  it('its setup checks the receipt block, the radiogroup with the Product first, the primary on screen and not covered, and the one Close', () => {
    for (const needle of ['On the receipt', 'Is it one of these?', 'radiogroup', 'Use Kitchen roll 4 pack', 'elementFromPoint', 'button[aria-label="Close"]']) expect(src, needle).toContain(needle)
  })
  it('receipt-photos-bar runs on the photos screen at 375, 390, 834 and 667x375', () => {
    const s = scenario('receipt-photos-bar')
    expect(s).toBeDefined()
    expect(s!.route).toBe('/scan/receipt')
    expect(s!.start).toBe('/scan')
    expect(s!.widths).toEqual([375, 390, 834, '667x375'])
    expect(s!.setup).toBeTruthy()
  })
  it('its setup checks Take a photo as the primary, Read the receipt after one photo, Add another photo, focus on Edit, the IconSet gap, the frame and the bar', () => {
    for (const needle of ['Take|Choose', 'Read the receipt', 'Add another photo', 'Edit photo 1', '.icon-set', 'borderTopWidth', 'sticky bar covers']) expect(src, needle).toContain(needle)
  })
  it('the seed makes the Product the fake read\'s Kitchen roll line matches, and the ids file says it', () => {
    const seed = readFileSync(resolve(cwd, '../scripts/test/fixtures/page-layout-seed/b9-50.mjs'), 'utf8')
    expect(seed).toMatch(/export const order = \d+/)
    expect(seed).toContain('Kitchen roll 4 pack')
    for (const key of ['kitchenRollIngredientId', 'kitchenRollProductId']) expect(seed).toContain(key)
    expect(readFileSync(resolve(cwd, '../scripts/test/fixtures/page-layout-seed.mjs'), 'utf8')).toContain('kitchenRollProductId')
  })
})
