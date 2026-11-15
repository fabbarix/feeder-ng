// fast-checks: the parallel page-layout guard splits its work in units (scripts/lib/page-layout/units.mjs) and runs at a fixed time of
// the week (scripts/lib/page-layout/test-clock.mjs). The units must hold exactly the probes the serial loop ran, and the merged report
// must read as one driver's.
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodeFs = 'node:fs'
const { readdirSync, readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readdirSync: (p: string) => string[]; readFileSync: (p: string, e: string) => string }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const load = createRequire(resolve(cwd, 'package.json'))

interface Scenario {
  name: string
  route: string
  widths?: (number | string)[]
  setup?: string
}
interface Unit {
  n: number
  id: string
  kind: string
  probes: number
  cost: number
}
const rules = load(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  ROUTES: [string, string][]
  SCENARIOS: Scenario[]
  PROFILES: Record<string, unknown[]>
  RESIZE_WALKS: { scenario: string }[]
  resizeWalkWidths: () => number[]
  resizeSweepWidths: () => number[]
  scenarioViewports: (s: Scenario, v: unknown[]) => unknown[]
}
const units = load(resolve(cwd, '../scripts/lib/page-layout/units.mjs')) as {
  planUnits: (o: Record<string, unknown>) => Unit[]
  reportLines: (o: Record<string, unknown>) => { lines: string[]; bad: number; probes: number }
}
const clock = load(resolve(cwd, '../scripts/lib/page-layout/test-clock.mjs')) as {
  seedAt: (ms: number) => number
  probeAt: (ms: number) => number
  dateShim: (offset: number) => string
}

const plan = (profile: string, only: string | null = null) =>
  units.planUnits({
    routes: rules.ROUTES, scenarios: rules.SCENARIOS, viewports: rules.PROFILES[profile], walks: rules.RESIZE_WALKS,
    walkWidths: rules.resizeWalkWidths(), sweepWidths: rules.resizeSweepWidths(), scenarioViewports: rules.scenarioViewports, only,
  })
/** The probe count of the serial loop the driver ran before the units: routes and scenarios at their viewports, then the walks. */
const serialCount = (profile: string) => {
  const v = rules.PROFILES[profile] ?? []
  let n = rules.ROUTES.length * v.length
  for (const s of rules.SCENARIOS) n += s.widths ? s.widths.length : v.length
  for (const _ of rules.RESIZE_WALKS) n += rules.resizeWalkWidths().length + 1
  return n
}

describe('planUnits', () => {
  it.each(['quick', 'full'])('the %s profile holds the serial loop\'s probes, one unit per route, scenario and walk', (profile) => {
    const u = plan(profile)
    expect(u.reduce((t, x) => t + x.probes, 0)).toBe(serialCount(profile))
    expect(u).toHaveLength(rules.ROUTES.length + rules.SCENARIOS.length + rules.RESIZE_WALKS.length)
    expect(new Set(u.map((x) => x.n)).size).toBe(u.length)
  })
  it('puts the longest units first', () => {
    const costs = plan('quick').map((x) => x.cost)
    expect(costs).toEqual([...costs].sort((a, b) => b - a))
  })
  it('keeps PAGE_LAYOUT_ONLY', () => {
    const u = plan('quick', '^/shop$')
    expect(u.length).toBeGreaterThan(1)
    expect(u.every((x) => x.id === 'route /shop' || x.kind !== 'route')).toBe(true)
  })
})

describe('reportLines', () => {
  const exemptions = [{ pattern: '/board', reason: 'r' }]
  it('merges results in unit order: findings, then not inspected, the coverage line, and the verdict', () => {
    const r = units.reportLines({
      exemptions, profileName: 'quick', seconds: 9,
      results: [
        { n: 2, probes: 3, failures: ['375px /b: P1 b'], notInspected: [] },
        { n: 1, probes: 2, failures: ['375px /a: P1 a'], notInspected: [{ width: 375, route: '/board', pattern: '/board', reason: 'x' }] },
      ],
    })
    expect(r.lines).toEqual([
      'check-page-layout: 2 failure(s), 0 not inspected (quick profile, 9s)',
      '  - 375px /a: P1 a',
      '  - 375px /b: P1 b',
      '  ~ 375px /board: exempt (r)',
      'check-page-layout: coverage: inspected 4 of 5 (not inspected 1: 1 exempt, 0 failing)',
    ])
    expect(r.bad).toBe(2)
  })
  it('says OK with the probe count when nothing is wrong', () => {
    const r = units.reportLines({ exemptions, profileName: 'quick', seconds: 3, results: [{ n: 0, probes: 4, failures: [], notInspected: [] }] })
    expect(r.lines.at(-1)).toBe('check-page-layout: OK (4 probes, 3s)')
    expect(r.bad).toBe(0)
  })
})

describe('the test clock', () => {
  it('seeds at Wednesday 15:00 UTC of the week, and probes ten minutes later', () => {
    for (const real of ['2026-11-15T23:59:00Z', '2026-11-09T00:00:00Z', '2026-11-11T16:00:00Z']) {
      const at = new Date(clock.seedAt(Date.parse(real)))
      expect(at.toISOString()).toBe('2026-11-11T15:00:00.000Z')
    }
    expect(clock.probeAt(0)).toBe(600_000)
  })
  it('the page shim moves new Date() and Date.now(), not dated Dates', () => {
    const scope: { Date: DateConstructor; __feederTestClock?: number } = { Date }
    // Run the shim against a scope of its own, not this test's globals.
    new Function('globalThis', clock.dateShim(86_400_000))(scope)
    const Shifted = scope.Date
    expect(Math.round((Shifted.now() - Date.now()) / 1000)).toBe(86_400)
    expect(Math.round((new Shifted().getTime() - Date.now()) / 1000)).toBe(86_400)
    expect(new Shifted(0).getTime()).toBe(0)
    expect(new Shifted() instanceof Date).toBe(true)
    expect(Shifted.UTC(2026, 0, 1)).toBe(Date.UTC(2026, 0, 1))
  })
})

describe('scenario state between units', () => {
  // Each unit of the parallel guard starts on a fresh copy of the seeded database. A scenario module that remembers what its setups did
  // (to undo it in a later setup) must forget it at the start of a unit: it declares reset() (registry RESETS), which the driver calls.
  // A counter that only makes fresh values (b9-41's item codes) needs none.
  const dir = resolve(cwd, '../scripts/lib/page-layout/scenarios')
  const noReset = new Set(['b9-41.mjs'])
  it('every module with module-level state declares reset()', () => {
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.mjs'))) {
      const text = readFileSync(resolve(dir, f), 'utf8')
      if (!/^let /m.test(text) || noReset.has(f)) continue
      const mod = (load(resolve(dir, f)) as { default: { reset?: unknown } }).default
      expect(typeof mod.reset, `${f} keeps state between setups and has no reset()`).toBe('function')
    }
  })
  it('the registry collects them', () => {
    const r = load(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as { RESETS: unknown[] }
    expect(r.RESETS.length).toBeGreaterThanOrEqual(5)
  })
  it('no scenario exists only to undo another (each unit starts on a fresh seed)', () => {
    expect(rules.SCENARIOS.map((s) => s.name).filter((n) => /-restore$/.test(n))).toEqual([])
  })
})
