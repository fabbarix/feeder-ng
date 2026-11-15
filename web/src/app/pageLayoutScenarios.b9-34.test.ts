// B9-34 (SSP-01, A11Y-07; plan section 9): the guard files of the Shop's ticking are registered and read what the plan says.
//   scenarios/b9-34.mjs: shop-ticked (P23 on ticked rows) and shop-focus-after-tick (the A11Y-07 focus scenario)
//   probes/cut-meta.mjs: widened from the Shop's info metas to every visible `.list-row__meta-text` (the general form B9-29 also takes)
//   page-layout-seed/b9-34.mjs: the ticked Lines the scenarios read
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
  PROBES: { name: string; key: string | null; source: string }[]
  SCENARIOS: { name: string; route: string; start?: string; setup?: string; widths?: (number | string)[]; rules?: string[] }[]
}
const scenario = (name: string) => api.SCENARIOS.find((s) => s.name === name)

describe('B9-34 page-layout scenarios', () => {
  it('shop-ticked runs P23 on /shop at 375, 390, 834 and 1440 (the plan\'s 1120 is not a scenario viewport; 834 and 1440 show the card grid)', () => {
    const s = scenario('shop-ticked')
    expect(s).toBeDefined()
    expect(s!.route).toBe('/shop')
    expect(s!.widths).toEqual([375, 390, 834, 1440])
    expect(s!.rules).toEqual(['P23'])
    expect(s!.setup).toBeTruthy()
  })

  it('shop-focus-after-tick exists on /shop (its setup asserts the focus; A11Y-07)', () => {
    const s = scenario('shop-focus-after-tick')
    expect(s).toBeDefined()
    expect(s!.route).toBe('/shop')
    expect(s!.setup).toBeTruthy()
  })

  it('the cut-meta probe reads every row meta line (the Shop\'s ticked ones included), not only the info ones', () => {
    const probe = api.PROBES.find((p) => p.name === 'cut-meta')!
    expect(probe.source).not.toContain('[data-status="info"] .list-row__meta-text')
    expect(probe.source).toContain("querySelectorAll('.list-row__meta-text')")
  })

  it('the seed ticks Lines for the scenarios and says which ones in the ids file', () => {
    const seed = readFileSync(resolve(cwd, '../scripts/test/fixtures/page-layout-seed/b9-34.mjs'), 'utf8')
    expect(seed).toMatch(/export const order = \d+/)
    expect(seed).toContain('/api/shopping/ticks')
    for (const key of ['tickedHandId', 'tickedNoStockId', 'scanTickedId', 'moreSinceId']) expect(seed).toContain(key)
  })
})
