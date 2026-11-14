// beta.7 (H8, SR6, RR5): the page-layout guard probes the new routes (/supplies, /supplies/:id and the two receipt screens) and the
// beta.7 states as scenarios with their own widths and a setup: the quick-Use sheet, the Supply page, the Shop list's Supplies group,
// the Scan screen in shop mode (rows, an active row, the Price keypad, the new-Product sheet) and the receipt screens (no photo, one,
// the photo edit sheet, a done read's review). In a browser: scripts/check-page-layout.sh on the real build.
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
  open?: boolean
  start?: string
  setup?: string
  widths?: number[]
}
interface Viewport {
  width: number
  height: number
  mobile: boolean
}
const rules = createRequire(resolve(cwd, 'package.json'))(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  ROUTES: [string, string][]
  SCENARIOS: Scenario[]
  PROFILES: Record<string, Viewport[]>
  resolveScenario: (s: Scenario, ids: Record<string, unknown>) => string
  resolveRoute: (p: string, ids: Record<string, unknown>) => string
  scenarioViewports: (s: Scenario, profile: Viewport[]) => Viewport[]
}
const driver = readFileSync(resolve(cwd, '../scripts/check-page-layout.mjs'), 'utf8')
const modes = readFileSync(resolve(cwd, '../scripts/check-page-layout.modes'), 'utf8')
const seed = readFileSync(resolve(cwd, '../scripts/test/fixtures/page-layout-seed.mjs'), 'utf8')
const wrapper = readFileSync(resolve(cwd, '../scripts/check-page-layout.sh'), 'utf8')
const byName = (name: string) => rules.SCENARIOS.find((s) => s.name === name)

describe('ROUTES: the beta.7 pages', () => {
  it.each([
    ['/supplies', 'narrow'],
    ['/supplies/:id', 'narrow'],
    ['/scan/receipt', 'narrow'],
    ['/scan/receipt/review', 'narrow'],
  ])('lists %s (%s)', (path, kind) => {
    expect(rules.ROUTES).toContainEqual([path, kind])
  })
  it('a Supply page takes the seeded Supply id', () => {
    expect(rules.resolveRoute('/supplies/:id', { supplyId: 41 })).toBe('/supplies/41')
  })
  it('the modes file fails the layout on the Supplies pages and the receipt screens', () => {
    const fail = modes
      .split('\n')
      .filter((l) => l.startsWith('fail_routes='))
      .flatMap((l) => l.slice('fail_routes='.length).trim().split(/\s+/))
    for (const r of ['/supplies', '/supplies/:id', '/scan/receipt', '/scan/receipt/review']) expect(fail, r).toContain(r)
  })
})

describe('SCENARIOS: the beta.7 states, at the widths of their design rows', () => {
  const PHONE_TABLET = [360, 390, 834]
  const WITH_DESKTOP = [360, 390, 834, 1440]
  it.each([
    ['supplies-use-sheet', '/supplies', WITH_DESKTOP],
    ['supply-page', '/supplies/:id', WITH_DESKTOP],
    ['shop-supplies-group', '/shop', WITH_DESKTOP],
    ['scan-scanned-list', '/scan', PHONE_TABLET],
    ['scan-row-active', '/scan', PHONE_TABLET],
    ['scan-price-keypad', '/scan', PHONE_TABLET],
    ['scan-new-product', '/scan', PHONE_TABLET],
    ['receipt-photos-empty', '/scan/receipt', WITH_DESKTOP],
    ['receipt-photos-one', '/scan/receipt', WITH_DESKTOP],
    ['receipt-photo-edit', '/scan/receipt', WITH_DESKTOP],
    ['receipt-review', '/scan/receipt/review', WITH_DESKTOP],
  ])('%s probes %s at %j px', (name, route, widths) => {
    const s = byName(name)
    expect(s?.route).toBe(route)
    expect(s?.widths).toEqual(widths)
    expect(s?.setup, name).toBeTruthy()
  })
  it('every route a scenario names is in ROUTES (so it has a width kind and a mode)', () => {
    const paths = rules.ROUTES.map(([p]) => p)
    for (const s of rules.SCENARIOS) expect(paths, s.name).toContain(s.route)
  })
  it('the driver has a setup for every scenario that names one', () => {
    for (const s of rules.SCENARIOS.filter((x) => x.setup)) expect(driver, s.name).toMatch(new RegExp(`\\b${s.setup}\\b`))
  })
  it('a scenario with a start opens it, its :id from the ids file; the filtered ones keep their query', () => {
    expect(rules.resolveScenario(byName('supply-page')!, { supplyId: 7 })).toBe('/supplies/7')
    expect(rules.resolveScenario(byName('receipt-review')!, {})).toBe('/scan')
    expect(rules.resolveScenario(byName('pantry-filtered')!, { longPlaceId: 3 })).toMatch(/^\/pantry\?/)
  })
  it('a scenario with widths runs at exactly those, phones emulated as phones; one without runs at every viewport of the profile', () => {
    const vps = rules.scenarioViewports(byName('receipt-review')!, rules.PROFILES.quick!)
    expect(vps.map((v) => [v.width, v.mobile])).toEqual([
      [360, true],
      [390, true],
      [834, false],
      [1440, false],
    ])
    expect(rules.scenarioViewports(byName('recipes-filtered')!, rules.PROFILES.full!)).toEqual(rules.PROFILES.full)
  })
})

describe('the receipt review is a done read against the fake Anthropic API', () => {
  it('the wrapper starts cmd/fakeanthropic detached on loopback and stops it by its PID', () => {
    expect(wrapper).toMatch(/go build .*\.\/cmd\/fakeanthropic/)
    expect(wrapper).toMatch(/-addr 127\.0\.0\.1:/)
    expect(wrapper).toMatch(/setsid nohup .*FAKE_PIDFILE/)
    expect(wrapper).toMatch(/stop_fake/)
    expect(wrapper).toMatch(/FEEDER_SECRET_KEY=/)
  })
  it('the seeder turns the Recipe Assistant on against it and scans a Product carrying the receipt marker', () => {
    expect(seed).toMatch(/PAGE_LAYOUT_FAKE_ANTHROPIC_URL/)
    expect(seed).toMatch(/\/api\/recipe-assistant\/settings/)
    expect(seed).toMatch(/#fake:receipt/)
  })
})
