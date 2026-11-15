// B9-54 (RES-03; plan section 9): the guard files of the offline Shop are registered and read what the plan says.
//   scenarios/b9-54.mjs: shop-offline-tick (offline, tick the first row: [data-sync=pending], no .error-state, one toast) and shop-offline-sheet
//   helpers: the driver passes its CDP call, so a setup can take the page offline with Chrome's network emulation (`h.cdp`)
// The setups were loaded and syntax-checked, not run against a built app (the product code does not exist yet): the batch reviewer runs them.
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
  SETUPS: Record<string, unknown>
}
const scenario = (name: string) => api.SCENARIOS.find((s) => s.name === name)
const src = readFileSync(resolve(cwd, '../scripts/lib/page-layout/scenarios/b9-54.mjs'), 'utf8')

describe('B9-54 page-layout scenarios', () => {
  it('shop-offline-tick runs on /shop at 375, 390, 834 and 1440 with every rule', () => {
    const s = scenario('shop-offline-tick')
    expect(s).toBeDefined()
    expect(s!.route).toBe('/shop')
    expect(s!.start).toBe('/shop')
    expect(s!.widths).toEqual([375, 390, 834, 1440])
    expect(s!.rules).toBeUndefined()
    expect(api.SETUPS[s!.setup!]).toBeTypeOf('function')
  })
  it('its setup goes offline with Network.emulateNetworkConditions, ticks the first row and asserts the waiting row, no error tile and one toast', () => {
    for (const needle of ['Network.emulateNetworkConditions', 'offline: true', 'data-sync="pending"', '.error-state', 'waiting to sync', 'Waiting to sync', '.list-row__sync-badge', 'aria-pressed', '.toast', 'waiting'])
      expect(src, needle).toContain(needle)
  })
  it('shop-offline-sheet runs the sheet rules on a touch emulation at 375, 834 and 667x375', () => {
    const s = scenario('shop-offline-sheet')
    expect(s).toBeDefined()
    expect(s!.route).toBe('/shop')
    expect(s!.widths).toEqual([375, 834, '667x375'])
    expect(s!.rules).toEqual(['P1', 'P8', 'P18', 'P25', 'P33'])
    expect(s!.emulate?.length).toBeGreaterThan(0)
    expect(api.SETUPS[s!.setup!]).toBeTypeOf('function')
  })
  it('its setup asserts the state line, the waiting addition row, its Take back and the one Close', () => {
    for (const needle of ['dialog.sheet[open]', 'Waiting to sync', '.ticked-sheet__adds', 'data-take-back', 'button[aria-label="Close"]']) expect(src, needle).toContain(needle)
  })
  it('the helpers carry the driver\'s CDP call (h.cdp) and the driver passes it', () => {
    const helpers = req(resolve(cwd, '../scripts/lib/page-layout/helpers.mjs')) as {
      installHelpers: (p: { evaluate: unknown; sleep: unknown; ids: unknown; cdp?: unknown }) => { cdp?: unknown }
    }
    const cdp = () => {}
    expect(helpers.installHelpers({ evaluate: () => {}, sleep: () => {}, ids: {}, cdp }).cdp).toBe(cdp)
    expect(readFileSync(resolve(cwd, '../scripts/check-page-layout.mjs'), 'utf8')).toMatch(/installHelpers\(\{[^}]*\bcdp\b[^}]*\}\)/)
  })
})
