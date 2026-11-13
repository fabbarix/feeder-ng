// pantry-filter: the page-layout guard also probes the filtered /pantry (Use soon and a 60-character Storage Place), closed and with
// its Filters panel open, at every width, and walks it through phone widths (docs/design/pantry-filter.md 10). The probes P17 to P20
// read the shared filter-header classes, so they see both headers. In a browser: scripts/check-page-layout.sh on the real build.
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()

interface Scenario {
  name: string
  route: string
  open: boolean
}
const rules = createRequire(resolve(cwd, 'package.json'))(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  SCENARIOS: Scenario[]
  RESIZE_WALK: { scenario: string; from: number; to: number; step: number }
  RESIZE_WALKS?: { scenario: string; from: number; to: number; step: number }[]
  resolveScenario: (s: Scenario, ids: Record<string, unknown>) => string
}
const driver = readFileSync(resolve(cwd, '../scripts/check-page-layout.mjs'), 'utf8')
const seed = readFileSync(resolve(cwd, '../scripts/test/fixtures/page-layout-seed.mjs'), 'utf8')
const maxPlaceName = Number(/const maxPlaceName = (\d+)/.exec(readFileSync(resolve(cwd, '../internal/stock/store/storage.go'), 'utf8'))?.[1])

describe('SCENARIOS: the filtered /pantry, closed and with the panel open', () => {
  it('has both, after the Recipes ones', () => {
    expect(rules.SCENARIOS.filter((s) => s.route === '/pantry').map((s) => [s.name, s.open])).toEqual([
      ['pantry-filtered', false],
      ['pantry-filtered-open', true],
    ])
  })
  it('resolveScenario puts Use soon and the long Storage Place from the ids file in the URL', () => {
    for (const s of rules.SCENARIOS.filter((x) => x.route === '/pantry')) {
      const url = rules.resolveScenario(s, { longPlaceId: 12, sideCourseId: 2, longTag: 'x' })
      const q = new URLSearchParams(url.split('?')[1] ?? '')
      expect(url.startsWith('/pantry?')).toBe(true)
      expect(q.get('status')).toBe('useSoon')
      expect(q.getAll('place')).toEqual(['12'])
      expect(q.has('course')).toBe(false)
    }
  })
})

describe('RESIZE_WALKS: both filtered headers are walked through phone widths', () => {
  it('walks /recipes as before, and /pantry over the same widths', () => {
    expect(rules.RESIZE_WALKS).toEqual([rules.RESIZE_WALK, { ...rules.RESIZE_WALK, scenario: 'pantry-filtered' }])
    for (const w of rules.RESIZE_WALKS ?? []) expect(rules.SCENARIOS.map((s) => s.name)).toContain(w.scenario)
  })
  it('the driver runs every walk, fresh loads and the live sweep', () => {
    expect(driver).toMatch(/for \(const walk of RESIZE_WALKS\)/)
    expect(driver).toMatch(/SCENARIOS\.find\(\(x\) => x\.name === walk\.scenario\)/)
  })
})

describe('the probes read the shared filter header', () => {
  it('opens either header\'s Filters button', () => {
    expect(driver).toMatch(/\.filter-bar__search-row > \.button/)
  })
  it('P17 reads .filter-chips; P18 also the panel\'s chip lines (.filter-chip-group)', () => {
    expect(driver).toMatch(/querySelectorAll\('\.filter-chips'\)/)
    expect(driver).toMatch(/\.filter-chip-group > \.chip/)
  })
  it('P20 takes the slot gap from the header\'s own stack (.filter-bar) or the ListPage', () => {
    expect(driver).toMatch(/closest\('\.filter-bar, \.list-page'\)/)
    expect(driver).toMatch(/\.filter-panel__section/)
  })
})

describe('the seed', () => {
  const places = [...seed.matchAll(/\['([^']+)', '(pantry|fridge|freezer)'\]/g)]
  const longPlace = /const LONG_PLACE = '([^']+)'/.exec(seed)?.[1] ?? ''
  it('creates at least nine Storage Places, one of them the long one', () => {
    expect(places.length + (seed.includes("[LONG_PLACE, '") ? 1 : 0)).toBeGreaterThanOrEqual(9)
    expect(seed).toMatch(/\[LONG_PLACE, 'pantry'\]/)
  })
  it('the long Storage Place is exactly as long as the API allows', () => {
    expect(maxPlaceName).toBe(60)
    expect([...longPlace].length).toBe(maxPlaceName)
  })
  it('puts Lots in the Storage Places, a Use soon Lot in the long one, and writes longPlaceId to the ids file', () => {
    expect(seed).toMatch(/storagePlaceId = placeIds\[i\]/)
    expect(seed).toMatch(/clientUuid: 'layout-seed-use-soon', storagePlaceId: longPlaceId/)
    expect(seed).toMatch(/longPlaceId \}, null, 2\)/)
  })
  it('fails when the Storage Places were not all created', () => {
    expect(seed).toMatch(/longPlaceId === null \|\| placeIds\.length < PLACES\.length\)[^\n]*\n[^\n]*\n\s*process\.exit\(1\)/)
  })
})
