// B9-43 (SSP-04, SSP-09, SSP-13, SSP-14; plan section 9): the guard files of the Shop's notice, complete tile and open Line sheet.
//   scenarios/b9-43.mjs (order 350): shop-notice, shop-line-sheet, shop-line-sheet-price, shop-complete, shop-complete-restore
//   probes/cut-meta.mjs: also reads `.shop-notice__title` (the verb is never cut), keeping the list-row form P23 had
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const req = createRequire(resolve(cwd, 'package.json'))
const api = req(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  PROBES: { name: string; key: string | null; source: string }[]
  SCENARIOS: { name: string; route: string; start?: string; setup?: string; widths?: (number | string)[]; rules?: string[] }[]
}
const scenario = (name: string) => api.SCENARIOS.find((s) => s.name === name)

describe('B9-43 page-layout scenarios', () => {
  it('shop-notice runs P23 on /shop at 375, 390, 834 and 1440', () => {
    const s = scenario('shop-notice')
    expect(s).toBeDefined()
    expect(s!.route).toBe('/shop')
    expect(s!.widths).toEqual([375, 390, 834, 1440])
    expect(s!.rules).toEqual(['P23'])
    expect(s!.setup).toBeTruthy()
  })

  it('shop-line-sheet runs P23, P25 and P33 on the open Line\'s sheet at 375, 390, 834 and 1440', () => {
    const s = scenario('shop-line-sheet')
    expect(s).toBeDefined()
    expect(s!.widths).toEqual([375, 390, 834, 1440])
    expect(s!.rules).toEqual(['P23', 'P25', 'P33'])
    expect(s!.setup).toBeTruthy()
  })

  it('shop-line-sheet-price runs P25 and P33 on the Price sheet over it at 375, 390 and 1440', () => {
    const s = scenario('shop-line-sheet-price')
    expect(s).toBeDefined()
    expect(s!.widths).toEqual([375, 390, 1440])
    expect(s!.rules).toEqual(['P25', 'P33'])
  })

  it('shop-complete runs P23 at 375, 390, 834 and 1440, and a restore scenario follows it (the setup changes the seed)', () => {
    const s = scenario('shop-complete')
    expect(s).toBeDefined()
    expect(s!.widths).toEqual([375, 390, 834, 1440])
    expect(s!.rules).toEqual(['P23'])
    const names = api.SCENARIOS.map((x) => x.name)
    expect(names.indexOf('shop-complete-restore')).toBe(names.indexOf('shop-complete') + 1)
  })

  it('no scenario of the package runs below 375 px', () => {
    for (const name of ['shop-notice', 'shop-line-sheet', 'shop-line-sheet-price', 'shop-complete', 'shop-complete-restore']) {
      for (const w of scenario(name)!.widths ?? []) expect(typeof w === 'number' ? w : Number(String(w).split('x')[0]), name).toBeGreaterThanOrEqual(375)
    }
  })

  it('the cut-meta probe still reads every row meta line and now also the notice\'s title', () => {
    const probe = api.PROBES.find((p) => p.name === 'cut-meta')!
    expect(probe.source).toContain("querySelectorAll('.list-row__meta-text')")
    expect(probe.source).toContain('.shop-notice__title')
  })
})
