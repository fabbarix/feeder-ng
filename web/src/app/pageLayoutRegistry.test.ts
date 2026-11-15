// B9-03 (guard-split, docs/design/ui-remediation-plan-3.md section 6 and 9): scripts/lib/page-layout-rules.mjs becomes a facade over
// scripts/lib/page-layout/ (a registry, one module per rule in rules/, one per in-page probe in probes/, one per package's scenarios in
// scenarios/), so every later package adds ITS OWN files and edits no shared one.
//
// The contract these tests pin (the developer builds to it):
//   scripts/lib/page-layout/registry.mjs   exports RULES, RESERVED, ALWAYS_FAIL, PROBES, SCENARIOS, SETUPS, evaluateMetrics, selectScenarios.
//                                          It loads every module of rules/, probes/ and scenarios/ SYNCHRONOUSLY (readdirSync + createRequire:
//                                          the facade is loaded by the vitest files through require(esm), which cannot have a top-level await).
//   rules/Pnn-<slug>.mjs                  default export { id: 'Pnn', title, always, evaluate(metrics, { width, route, kind }) -> [{ rule, message }] }.
//                                          The file name's number is the id's; an id outside P1..P43, a mismatch, or a second module for an id throws on load.
//                                          P1..P23 exist now; P24..P43 are RESERVED (owner and mode from plan section 9) until a package adds the module.
//   probes/<slug>.mjs                      default export { name, key, source, minWidth? }: `source` is the in-page expression, `key` the metrics field
//                                          it fills (null: the base layout metrics themselves), `minWidth` the least viewport width it runs at.
//   scenarios/<slug>.mjs                   default export { scenarios: [...], setups: { <setup name>: async (h) => void } } where h is the driver's helper bag.
//   viewport.mjs                           emulationCalls(vp) -> the CDP calls that put a tab in a viewport (device metrics, plus the safe-area override).
//   page-layout-rules.mjs                  stays the one import of the driver and of every test: it re-exports the registry and keeps its own pure helpers.
// P1..P23 report EXACTLY what they reported before the split: evaluate-cases.json (made with the pre-split code) is the proof.
import { describe, expect, it } from 'vitest'
import { driverSource } from './pageLayoutSources'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const fs = (await import(/* @vite-ignore */ nodeFs)) as {
  readFileSync: (p: string, enc: string) => string
  readdirSync: (p: string) => string[]
  existsSync: (p: string) => boolean
  mkdirSync: (p: string, o: { recursive: true }) => void
  mkdtempSync: (p: string) => string
  cpSync: (a: string, b: string, o: { recursive: true }) => void
  writeFileSync: (p: string, s: string) => void
  rmSync: (p: string, o?: { recursive?: true; force?: true }) => void
}
const nodeVm = 'node:vm'
const { Script } = (await import(/* @vite-ignore */ nodeVm)) as { Script: new (src: string) => unknown }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const req = createRequire(resolve(cwd, 'package.json'))
const lib = (...p: string[]) => resolve(cwd, '../scripts/lib', ...p)
const golden = (f: string) => JSON.parse(fs.readFileSync(resolve(cwd, '../scripts/test/fixtures/page-layout-golden', f), 'utf8'))

interface Finding { rule: string; message: string }
interface Ctx { width: number; route: string; kind: string }
interface RuleModule { id: string; title: string; always: boolean; evaluate: (m: unknown, ctx: Ctx) => Finding[] }
interface Probe { name: string; key: string | null; source: string; minWidth?: number }
interface Scenario { name: string; route: string; open?: boolean; start?: string; setup?: string; widths?: (number | string)[] }
interface Viewport { width: number; height: number; mobile: boolean; safeArea?: { top: number; right: number; bottom: number; left: number } }
interface Api {
  evaluateMetrics: (m: unknown, ctx: Ctx) => Finding[]
  evaluateDarkMetrics: (m: unknown, ctx: Ctx) => Finding[]
  DARK_PROBES: Probe[]
  ALWAYS_FAIL: string[]
  SCENARIOS: Scenario[]
  PROFILES: Record<'quick' | 'full', Viewport[]>
  SCENARIO_VIEWPORTS: Record<string, Viewport>
  scenarioViewports: (s: Scenario, profile: Viewport[]) => Viewport[]
  RULES: RuleModule[]
  RESERVED: { id: string; owner: string; mode: 'always' | 'mode'; title: string }[]
  PROBES: Probe[]
  SETUPS: Record<string, (h: unknown) => Promise<void>>
  selectScenarios: (list: Scenario[], spec?: string) => Scenario[]
}
const load = (dir = lib()): Api => req(resolve(dir, 'page-layout-rules.mjs')) as Api
const facade = load()
// Until the registry exists every test that needs it fails on its own, with the load error; the golden tests above it still run.
const registry: Api = (() => {
  try {
    return req(lib('page-layout', 'registry.mjs')) as Api
  } catch (e) {
    return new Proxy({} as Api, {
      get: (_t, k) => {
        throw new Error(`scripts/lib/page-layout/registry.mjs is not loadable (reading ${String(k)}): ${(e as Error).message}`)
      },
    })
  }
})()

/** A scratch copy of scripts/lib (a package's own files are dropped into it), removed by the caller. */
function scratchLib(): { dir: string; done: () => void } {
  const base = resolve(cwd, '../build')
  fs.mkdirSync(base, { recursive: true })
  const root = fs.mkdtempSync(resolve(base, 'vitest-page-layout-'))
  fs.cpSync(lib(), resolve(root, 'lib'), { recursive: true })
  return { dir: resolve(root, 'lib'), done: () => fs.rmSync(root, { recursive: true, force: true }) }
}
const put = (dir: string, rel: string, text: string) => {
  fs.mkdirSync(resolve(dir, rel, '..'), { recursive: true })
  fs.writeFileSync(resolve(dir, rel), text)
}
const sortJson = (list: unknown[]) => list.map((x) => JSON.stringify(x)).sort()
const ruleNum = (id: string) => Number(id.slice(1))
/**
 * What the packages have added with their own files since the split (w0b integration: B9-02's P27 and font-24, B9-01's P29 and P30).
 * The golden files describe the pre-split module (P1..P23 and the beta.8 scenarios); a package that adds a rule or a scenario adds it here.
 */
const ADDED = {
  // B9-13 added P24, P28, P40, P41; B9-14 P25, P33; B9-16 P36; B9-18 P43; B9-19 P31, P32, P35; B9-32 P38; B9-40 P34; B9-44 P42; B9-49 P37.
  rules: ['P24', 'P25', 'P26', 'P27', 'P28', 'P29', 'P30', 'P31', 'P32', 'P33', 'P34', 'P35', 'P36', 'P37', 'P38', 'P39', 'P40', 'P41', 'P42', 'P43'],
  // font-24-settings-shops-id was deferred in w0b (scenarios/font-24.mjs FONT_24_DEFERRED); B9-09 runs it again.
  // B9-07: scenarios/b9-07.mjs (order 300, after font-24's 200): P26's Today resize walk and P39's ring-room pages.
  // B9-15: scenarios/b9-15.mjs (order 315): the crafted Select open on Settings > Planning, and shop-barcode-sheet (the Add Shop Barcode sheet,
  // held until B9-30 built its Product Select; B9-30 deleted B9_15_DEFERRED and added the name here).
  // B9-30: scenarios/b9-30.mjs (order 330): shop-page, shop-delete-confirm, product-page, products-new-product.
  // B9-10: scenarios/recipe-editor.mjs (order 40): the Recipe editor with the 36-character Tag (DS-04).
  // B9-14: scenarios/b9-14.mjs (order 310): the sheet scenarios of P25 and P33 and the sheet page of P39.
  // B9-16: scenarios/b9-16.mjs (order 310, after b9-14 by file name): P36's touch-targets-controls and the household-errors check.
  // B9-18: scenarios/b9-18.mjs (order 320): P43's toast-pricing and toast-over-bar on /scan.
  // B9-42: scenarios/b9-42.mjs (order 320, after b9-18 by file name): the Meal Slots cards, editor, Remove confirm, Removed tile, Change a date.
  // B9-26: scenarios/b9-26.mjs (order 326): plan-after-swap (PC-01), regenerate (SAFE-07) and to-confirm-not-cooked (SAFE-03).
  // B9-19: scenarios/b9-19.mjs (order 330): P31's bottom bar, P32's chrome budget in landscape and at 400 % zoom, P35's safe gutters.
  // B9-29: scenarios/b9-29.mjs (order 330): pantry-put-away (SSP-10), meta-fit-pantry and meta-fit-supplies (SSP-05, P23 at 1120), text-spacing-pantry (DS-03, DS-10).
  // B9-31: scenarios/b9-31.mjs (order 330, after b9-19 by file name): recipe-editor-guard (SAFE-01) and recipe-new-empty-save (SAFE-04).
  // B9-36: scenarios/b9-36.mjs (order 330, after b9-31 by file name): preferences-preview (SAFE-08).
  // B9-52: scenarios/b9-52.mjs (order 330, after b9-36 by file name): allowlist-actions, allowlist-share and access-requests-rows (SET-03, SET-12).
  // B9-32: scenarios/b9-32.mjs (order 332): plan-grid (PC-11, PC-06, A11Y-08, A11Y-09) and plan-couldnt (PC-07); rules/P38-unique-names.mjs (A11Y-08).
  // B9-39: scenarios/b9-39.mjs (order 336): today-after-lunch (TB-01, TB-10, TB-15b: the hero at 14:44, the eyebrow, the ⋮ never over the name) and today-after-swap.
  // B9-38: scenarios/b9-38.mjs (order 338): plan-sheet-actions, plan-sheet-mark-cooked, plan-sheet-swap, plan-sheet-choose, plan-sheet-choose-ring and plan-sheet-whos-eating (PC-09, PC-10, SHORT-02).
  // B9-25: scenarios/b9-25.mjs (order 340): timer-pill and timer-pill-editor (PC-04). No rule number: the setup measures the pill and throws on a finding.
  // B9-34: scenarios/b9-34.mjs (order 340, after b9-25 by file name): shop-ticked (P23 on ticked rows) and shop-focus-after-tick (A11Y-07).
  // B9-35: scenarios/b9-35.mjs (order 340, after b9-34 by file name): scan-typed (no camera, P12 and P30), scan-camera-typed and scan-camera-landscape (a fake camera).
  // scan-price-keypad (scenarios/scan.mjs) is also a P43 scenario now: its setup shows a toast while the Price keypad is open.
  // B9-37: scenarios/b9-37.mjs (order 340, after b9-35 by file name): the editor flow (RX height budget, new Recipe, ring room, restored focus, Tag chooser) and P12's option-cover probe.
  // B9-51: scenarios/b9-51.mjs (order 340, after b9-37 by file name): tags-rows (SET-11), assistant-bar (SHORT-06), toast-over-preferences-bar, planning-cooking-times (PC-14, A2, SAFE-04).
  // B9-27: scenarios/recipe-detail.mjs (order 340, after b9-51 by file name): the Cook tile in the first viewport, the side column's edges and the phone Cook bar (RX-04, SHORT-04);
  // the seed step page-layout-seed/recipe-detail.mjs gives the seeded Recipe its lede, Source, eight Tags and an untimed Step.
  // B9-41: scenarios/b9-41.mjs (order 341): scan-weighed (SSP-07, SSP-20: the weighed header, the keypad on per kg, the focused key's ring).
  // B9-44: scenarios/b9-44.mjs (order 344): today-advance (TB-02), today-grid (TB-03, TB-09, TB-11, with the resize walk), today-shopping (TB-12), today-cls and plan-cls (RES-05).
  // B9-46: scenarios/b9-46.mjs (order 346): plan-away, away-sheet, away-sheet-open, whos-eating-away and member-away (PC-08, SET-16).
  // B9-40: scenarios/b9-40.mjs (order 350): cook-step-landscape and cook-step-portrait (P34, SHORT-01) and cook-step-photo (PC-03; the setup measures and throws).
  // B9-43: scenarios/b9-43.mjs (order 350, after b9-40 by file name): shop-notice, shop-line-sheet, shop-line-sheet-price, shop-complete and shop-complete-restore (SSP-04, 09, 13, 14).
  // B9-47: scenarios/b9-47.mjs (order 350, after b9-43 by file name): the Kitchen board on real screens (TB-04, TB-07, TB-08, TB-15c/d, SHORT-03, A11Y-12, RES-09): board-wall, board-portrait, board-short, board-phone, board-close, board-error.
  // B9-49: scenarios/b9-49.mjs (order 350, after b9-47 by file name): shell-skip-link (A11Y-10), shell-offline-banner (RES-07), nav-current-recipe,
  // nav-current-recipe-edit and nav-current-ingredient (TB-13), toast-region-chromeless, boot-theme (RES-08). No rule number but P37 (titles): the setups measure and throw on a finding.
  // B9-45: scenarios/b9-45.mjs (order 360): cooked-confirmation and cook-get-ready (Cook Mode, PC-02 and PC-05) and leftover-freeze-sheet (PC-13). No rule number: the setups measure and throw.
  // B9-53: scenarios/b9-53.mjs (order 370): first-run-zone, first-run-member, first-run-slots and first-run-compact (TB-06; the empty Household is a fetch stub installed by `emulate`). No rule number: the setups measure and throw.
  // B9-20: scenarios/res-state.mjs (order 400): offline-unknown (RES-02) and error-state-fast (RES-06).
  // B9-28: scenarios/import.mjs (order 410): import-review and import-result (RX-01, RX-11).
  // B9-48: scenarios/b9-48.mjs (order 480): the Keeping tile of an Ingredient and of a Supply, the Rename sheet and the Delete confirm.
  // B9-50: scenarios/b9-50.mjs (order 500): receipt-review-add and receipt-add-sheet (SSP-08), receipt-photos-bar (SSP-19, A11Y-09).
  // B9-54: scenarios/b9-54.mjs (order 540): shop-offline-tick and shop-offline-sheet (RES-03), the Shop ticked offline.
  // B9-55: scenarios/b9-55.mjs (order 550): cook-three-timers (the Cook Mode timer strip at 375), recipe-timer-pill (the floating pill over the hero chip line) and
  // receipt-add-sheet-again (the receipt Add... sheet once more after every other receipt scenario). The setups measure and throw.
  scenarios: [
    'recipe-editor-long-tag', 'font-24-today', 'font-24-shop', 'font-24-settings-shops-id', 'font-24-recipes-id', 'today-columns', 'focus-ring-room-today', 'focus-ring-room-fields',
    'leftover-menu-sheet', 'sheet-planned-meal', 'sheet-add-member', 'sheet-short-landscape', 'sheet-zoom-400', 'focus-ring-room-sheet', 'touch-targets-controls', 'household-errors',
    'planning-recipe-select', 'shop-barcode-sheet', 'toast-pricing', 'toast-over-bar',
    'meal-slots-cards', 'meal-slot-editor', 'meal-slot-editor-narrow', 'meal-slot-editor-short', 'meal-slot-remove-confirm', 'removed-meal-slots', 'change-date',
    'plan-after-swap', 'regenerate', 'to-confirm-not-cooked',
    'bottom-bar', 'chrome-landscape', 'chrome-landscape-editor', 'chrome-landscape-detail', 'chrome-zoom-editor', 'chrome-zoom-detail', 'safe-gutters-today', 'safe-gutters-shop',
    'pantry-put-away', 'meta-fit-pantry', 'meta-fit-supplies', 'text-spacing-pantry',
    'shop-page', 'shop-delete-confirm', 'product-page', 'products-new-product',
    'recipe-editor-guard', 'recipe-new-empty-save',
    'preferences-preview',
    'allowlist-actions', 'allowlist-share', 'access-requests-rows',
    'plan-grid', 'plan-couldnt',
    'today-after-lunch', 'today-after-swap',
    'plan-sheet-actions', 'plan-sheet-mark-cooked', 'plan-sheet-swap', 'plan-sheet-choose', 'plan-sheet-choose-ring', 'plan-sheet-whos-eating',
    'timer-pill', 'timer-pill-editor',
    'shop-ticked', 'shop-focus-after-tick',
    'scan-typed', 'scan-camera-typed', 'scan-camera-landscape',
    'recipe-editor-flow', 'recipe-new-flow', 'recipe-editor-ring-room', 'recipe-editor-restored-focus', 'recipe-editor-tag-chooser',
    'tags-rows', 'assistant-bar', 'toast-over-preferences-bar', 'planning-cooking-times',
    'recipe-detail-cook', 'recipe-detail-phone',
    'scan-weighed',
    'today-advance', 'today-grid', 'today-shopping', 'today-cls', 'plan-cls',
    'plan-away', 'away-sheet', 'away-sheet-open', 'whos-eating-away', 'member-away',
    'cook-step-landscape', 'cook-step-portrait', 'cook-step-photo',
    'shop-notice', 'shop-line-sheet', 'shop-line-sheet-price', 'shop-complete', 'shop-complete-restore',
    'board-wall', 'board-portrait', 'board-short', 'board-phone', 'board-close', 'board-error',
    'shell-skip-link', 'shell-offline-banner', 'nav-current-recipe', 'nav-current-recipe-edit', 'nav-current-ingredient', 'toast-region-chromeless', 'boot-theme',
    'cooked-confirmation', 'cook-get-ready', 'leftover-freeze-sheet',
    'first-run-zone', 'first-run-member', 'first-run-slots', 'first-run-compact',
    'offline-unknown', 'error-state-fast',
    'import-review', 'import-result',
    'ingredient-keeping', 'supply-keeping', 'ingredient-rename-sheet', 'ingredient-delete-confirm',
    'receipt-review-add', 'receipt-add-sheet', 'receipt-photos-bar',
    'shop-offline-tick', 'shop-offline-sheet',
    'cook-three-timers', 'recipe-timer-pill', 'receipt-add-sheet-again',
  ],
}

describe('P1..P23 report exactly what they reported before the split (golden, made with the pre-split code)', () => {
  const cases = golden('evaluate-cases.json') as { name: string; metrics: unknown; ctx: Ctx; findings: Finding[] }[]
  it('the golden cases cover every rule P1..P23', () => {
    const seen = new Set(cases.flatMap((c) => c.findings.map((f) => f.rule)))
    for (let n = 1; n <= 23; n++) expect(seen.has(`P${n}`), `P${n} has a golden finding`).toBe(true)
  })
  it.each(cases.map((c) => [c.name, c] as const))('the facade gives the same findings: %s', (_n, c) => {
    expect(sortJson(facade.evaluateMetrics(c.metrics, c.ctx))).toEqual(sortJson(c.findings))
  })
  it.each(cases.map((c) => [c.name, c] as const))('the registry gives the same findings: %s', (_n, c) => {
    expect(sortJson(registry.evaluateMetrics(c.metrics, c.ctx))).toEqual(sortJson(c.findings))
  })
  it('keeps every export of the pre-split module, and its route table, scenarios and walks unchanged', () => {
    const g = golden('exports.json')
    for (const name of g.names) expect(Object.keys(facade), `export ${name}`).toContain(name)
    const f = facade as unknown as Record<string, unknown>
    for (const k of ['PAGE_WIDTH_PX', 'ROUTES', 'RESIZE_WALK', 'RESIZE_WALKS', 'RESIZE_SWEEP']) expect(f[k], k).toEqual(g[k])
    expect(facade.ALWAYS_FAIL.filter((id) => ruleNum(id) <= 23)).toEqual(g.ALWAYS_FAIL)
  })
  it('keeps every scenario (by name, with its definition); the order across modules is free', () => {
    const g = golden('exports.json').SCENARIOS as Scenario[]
    expect(facade.SCENARIOS.length).toBe(g.length + ADDED.scenarios.length)
    expect(facade.SCENARIOS.filter((x) => !g.some((y) => y.name === x.name)).map((x) => x.name)).toEqual(ADDED.scenarios)
    for (const s of g) expect(facade.SCENARIOS.find((x) => x.name === s.name), s.name).toEqual(s)
  })
  it('keeps the old scenario viewports', () => {
    const g = golden('exports.json').SCENARIO_VIEWPORTS as Record<string, Viewport>
    for (const [k, v] of Object.entries(g)) expect(facade.SCENARIO_VIEWPORTS[k], k).toEqual(v)
  })
})

describe('the facade is a facade', () => {
  const src = fs.readFileSync(lib('page-layout-rules.mjs'), 'utf8')
  it('holds no rule and no probe: they live in scripts/lib/page-layout/', () => {
    expect(src).not.toMatch(/add\('P\d+'/)
    expect(src).not.toMatch(/Probe\s*=/)
    expect(src).toMatch(/page-layout\/registry\.mjs/)
  })
  it('re-exports what the driver and the packages use', () => {
    for (const k of ['RULES', 'RESERVED', 'PROBES', 'SETUPS', 'selectScenarios', 'evaluateMetrics', 'ALWAYS_FAIL', 'SCENARIOS']) {
      expect(Object.keys(facade), k).toContain(k)
      expect((facade as unknown as Record<string, unknown>)[k], k).toBe((registry as unknown as Record<string, unknown>)[k])
    }
  })
})

describe('one module per rule', () => {
  const dir = lib('page-layout', 'rules')
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort() : []
  const numOf = (f: string) => Number(/^P(\d+)-.+\.mjs$/.exec(f)?.[1])
  it('rules/ holds one Pnn-<slug>.mjs for each of P1..P23, plus the ones the packages added, and nothing else', () => {
    expect(files.map(numOf).sort((a, b) => a - b)).toEqual([...Array.from({ length: 23 }, (_, i) => i + 1), ...ADDED.rules.map(ruleNum)])
  })
  it.each(files.map((f) => [f] as const))('%s: id = file number, a title, evaluate()', (f) => {
    const m = (req(resolve(dir, f)) as { default: RuleModule }).default
    expect(m.id).toBe(`P${numOf(f)}`)
    expect(typeof m.title).toBe('string')
    expect(m.title.length).toBeGreaterThan(10)
    expect(typeof m.always).toBe('boolean')
    expect(typeof m.evaluate).toBe('function')
  })
  it('RULES lists exactly those modules, and ALWAYS_FAIL is the ones marked always', () => {
    expect(registry.RULES.map((r) => r.id).sort()).toEqual(files.map((f) => `P${numOf(f)}`).sort())
    expect(registry.ALWAYS_FAIL.slice().sort()).toEqual(registry.RULES.filter((r) => r.always).map((r) => r.id).sort())
    expect(registry.ALWAYS_FAIL.filter((id) => ruleNum(id) <= 23).sort()).toEqual((golden('exports.json').ALWAYS_FAIL as string[]).slice().sort())
  })
  it('each module alone reports only its own id and, over the golden cases, exactly its share of the findings', () => {
    const cases = golden('evaluate-cases.json') as { metrics: unknown; ctx: Ctx; findings: Finding[] }[]
    for (const r of registry.RULES) {
      for (const c of cases) {
        const got = r.evaluate(c.metrics, c.ctx)
        for (const f of got) expect(f.rule, `${r.id} reports ${f.rule}`).toBe(r.id)
        expect(got, `${r.id}: ${JSON.stringify(c.ctx)}`).toEqual(c.findings.filter((f) => f.rule === r.id))
      }
    }
  })
  it('a module with no data reports nothing (a probe older than its field is clean)', () => {
    const bare = { vw: 1440, scrollW: 1440, clientW: 1440, over: [], content: { x: 480, r: 1200 }, railR: 240, container: { x: 440, r: 1240 }, pageWidthAttr: 'narrow', fields: [], bars: [], railContrast: 7, dialog: null }
    expect(registry.evaluateMetrics(bare, { width: 1440, route: '/settings', kind: 'narrow' })).toEqual([])
  })
})

describe('P24..P43 are reserved with their owners (plan section 9)', () => {
  const planned: [string, string, 'always' | 'mode'][] = [
    // B9-55 (plan section 9, "by mode -> always fail at B9-55"): every rule is always-fail at release, so PLANNED says 'always' for all of them.
    ['P24', 'B9-13', 'always'], ['P25', 'B9-14', 'always'], ['P26', 'B9-07', 'always'], ['P27', 'B9-02', 'always'], ['P28', 'B9-13', 'always'],
    ['P29', 'B9-01', 'always'], ['P30', 'B9-01', 'always'], ['P31', 'B9-19', 'always'], ['P32', 'B9-19', 'always'], ['P33', 'B9-14', 'always'],
    ['P34', 'B9-40', 'always'], ['P35', 'B9-19', 'always'], ['P36', 'B9-16', 'always'], ['P37', 'B9-49', 'always'], ['P38', 'B9-32', 'always'],
    ['P39', 'B9-07', 'always'], ['P40', 'B9-13', 'always'], ['P41', 'B9-13', 'always'], ['P42', 'B9-44', 'always'], ['P43', 'B9-18', 'always'],
  ]
  const want = planned.filter(([id]) => !ADDED.rules.includes(id))
  it('a rule a package has added is active with its planned mode, and no longer reserved', () => {
    for (const [id, , mode] of planned.filter(([x]) => ADDED.rules.includes(x))) {
      expect(registry.RULES.map((r) => r.id), id).toContain(id)
      expect(registry.ALWAYS_FAIL.includes(id), id).toBe(mode === 'always')
    }
  })
  it('RESERVED lists P24..P43 but the added ones, each with its owning package, its mode and a title', () => {
    expect(registry.RESERVED.map((r) => [r.id, r.owner, r.mode])).toEqual(want)
    for (const r of registry.RESERVED) expect(r.title.length, r.id).toBeGreaterThan(10)
  })
  it('a reserved rule is not active: it is not in RULES and not in ALWAYS_FAIL until its package adds the module', () => {
    for (const [id] of want) {
      expect(registry.RULES.map((r) => r.id)).not.toContain(id)
      expect(registry.ALWAYS_FAIL).not.toContain(id)
    }
  })
})

describe('a package adds its own files and edits no shared one', () => {
  const metrics = { vw: 1440, scrollW: 1440, clientW: 1440, over: [], content: { x: 480, r: 1200 }, railR: 240, container: { x: 440, r: 1240 }, pageWidthAttr: 'narrow', fields: [], bars: [], railContrast: 7, dialog: null }
  const ctx = { width: 1440, route: '/settings', kind: 'narrow' }
  const demoRule = (id: string) =>
    `export default { id: '${id}', title: 'demo rule of a package', always: true, evaluate: (m) => (m.demo ? [{ rule: '${id}', message: '${id} demo finding' }] : []) }\n`

  // release: with B9-49's P37, every planned rule is added and none is reserved, so the demo stands in for P37 in a copy without its module.
  it('a rules/P37-*.mjs file activates the reserved P37: it runs, is always-fail and leaves RESERVED', () => {
    const s = scratchLib()
    try {
      fs.rmSync(resolve(s.dir, 'page-layout/rules/P37-page-title.mjs'))
      put(s.dir, 'page-layout/rules/P37-demo.mjs', demoRule('P37'))
      const api = load(s.dir)
      expect(api.RULES.map((r) => r.id)).toContain('P37')
      expect(api.ALWAYS_FAIL).toContain('P37')
      expect(api.RESERVED.map((r) => r.id)).not.toContain('P37')
      expect(api.RESERVED.map((r) => r.id)).toEqual(['P24', 'P25', 'P26', 'P27', 'P28', 'P29', 'P30', 'P31', 'P32', 'P33', 'P34', 'P35', 'P36', 'P37', 'P38', 'P39', 'P40', 'P41', 'P42', 'P43'].filter((id) => !ADDED.rules.includes(id)))
      expect(api.evaluateMetrics({ ...metrics, demo: true }, ctx).map((f) => f.rule)).toEqual(['P37'])
      expect(api.evaluateMetrics(metrics, ctx)).toEqual([])
    } finally {
      s.done()
    }
  })
  it('a rule outside P1..P43, a file number that is not its id, and a second module for an id all throw on load', () => {
    for (const [file, id, why] of [['P99-demo.mjs', 'P99', /P99/], ['P25-demo.mjs', 'P26', /P2[56]/], ['P37-other.mjs', 'P37', /P37/]] as const) {
      const s = scratchLib()
      try {
        fs.rmSync(resolve(s.dir, 'page-layout/rules/P37-page-title.mjs'))
        put(s.dir, 'page-layout/rules/P37-demo.mjs', demoRule('P37'))
        put(s.dir, `page-layout/rules/${file}`, demoRule(id))
        expect(() => load(s.dir), file).toThrow(why)
      } finally {
        s.done()
      }
    }
  })
  // Review of B9-03: the mistakes a later package can make with its own files all fail on load, naming the file.
  it('a reserved rule with the wrong mode, a second probe for a metrics key, a viewport that does not exist, a setup without widths, and a stray non-.mjs file all throw on load', () => {
    const cases: [string, string, RegExp][] = [
      // B9-55: no rule is planned "by mode" any more; the check is the same for an always-fail one declared by mode.
      ['page-layout/rules/P43-demo.mjs', demoRule('P43').replace('always: true', 'always: false'), /P43 is planned as always fail/],
      ['page-layout/probes/zz-demo.mjs', "export default { name: 'zz-demo', key: 'cutMeta', source: '[]' }\n", /metrics key "cutMeta"/],
      ['page-layout/scenarios/zz-demo.mjs', "export default { scenarios: [{ name: 'zz-demo', route: '/shop', start: '/shop', setup: 's', widths: ['568x320'] }], setups: { s: async () => {} } }\n", /no viewport "568x320"/],
      ['page-layout/scenarios/zz-demo.mjs', "export default { scenarios: [{ name: 'zz-demo', route: '/shop', setup: 's' }], setups: { s: async () => {} } }\n", /setup but no widths/],
      ['page-layout/scenarios/zz-demo.mjs', "export default { scenarios: [{ name: 'zz-demo', route: '/shop', widths: [390] }], setups: {} }\n", /start route/],
      ['page-layout/scenarios/zz-demo.mjs', "export default { scenarios: [{ name: 'zz-demo', route: '/shop', start: '/shop', widths: [390], emulate: ['Page.setFontSizes'] }], setups: {} }\n", /emulate is a list/],
      ['page-layout/scenarios/zz-demo.mjs', "export default { scenarios: [{ name: 'zz-demo', route: '/shop', start: '/shop', widths: [390], rules: ['P99'] }], setups: {} }\n", /rules is a list/],
      ['page-layout/probes/zz-demo.mjs', "export default { name: 'zz-demo', key: 'zzDemo', scenarios: ['no-such'], source: '[]' }\n", /no-such/],
      ['page-layout/rules/P34-demo.js', demoRule('P34'), /only \.mjs modules/],
    ]
    for (const [file, text, why] of cases) {
      const s = scratchLib()
      try {
        put(s.dir, file, text)
        expect(() => load(s.dir), file).toThrow(why)
      } finally {
        s.done()
      }
    }
  })
  it('a dark probe and a rule with evaluateDark add a dark-scheme check; P10 and P29 (B9-01) use it', () => {
    expect(facade.DARK_PROBES.map((p) => p.name)).toEqual(['buttons', 'action-boundary'])
    expect(facade.evaluateDarkMetrics({ lowContrastButtons: [{ label: 'Save', ratio: 2 }] }, ctx).map((f) => f.message)).toEqual(['P10 Button "Save" contrast 2:1 (dark scheme)'])
    const s = scratchLib()
    try {
      put(s.dir, 'page-layout/probes/zz-demo.mjs', "export default { name: 'zz-demo', key: 'zzDemo', dark: true, source: '[]' }\n")
      // the demo takes an always-fail number; every planned rule is added now (B9-49: P37), so it replaces P37's module in the copy
      const id = facade.RESERVED.find((r) => r.mode === 'always')?.id ?? 'P37'
      if (id === 'P37') fs.rmSync(resolve(s.dir, 'page-layout/rules/P37-page-title.mjs'))
      put(s.dir, `page-layout/rules/${id}-demo.mjs`, `export default { id: '${id}', title: 'demo', always: true, evaluate: () => [], evaluateDark: (dm) => (dm.zzDemo ?? []).map((x) => ({ rule: '${id}', message: '${id} ' + x + ' (dark scheme)' })) }\n`)
      const api = load(s.dir)
      expect(api.DARK_PROBES.map((p) => p.name)).toEqual(['buttons', 'action-boundary', 'zz-demo'])
      expect(api.evaluateDarkMetrics({ zzDemo: ['weak'] }, ctx).map((f) => f.message)).toEqual([`${id} weak (dark scheme)`])
    } finally {
      s.done()
    }
  })
  it('a scenario with its own text size (B9-02 font-24): no setup, CDP calls before navigation, its own rules, a probe of its own', () => {
    const s = scratchLib()
    try {
      put(s.dir, 'page-layout/scenarios/zz-font.mjs', "export default { order: 900, scenarios: [{ name: 'zz-font', route: '/shop', start: '/shop', widths: [390, 1440], emulate: [{ method: 'Page.setFontSizes', params: { fontSizes: { standard: 24 } } }], rules: ['P1', 'P27'] }], setups: {} }\n")
      put(s.dir, 'page-layout/probes/zz-census.mjs', "export default { name: 'zz-census', key: 'zzCensus', scenarios: ['zz-font'], source: '[]' }\n")
      const api = load(s.dir)
      const sc = api.SCENARIOS.find((x) => x.name === 'zz-font') as Scenario & { emulate?: unknown[]; rules?: string[] }
      expect(sc.rules).toEqual(['P1', 'P27'])
      expect(api.PROBES.find((p) => p.name === 'zz-census')).toBeTruthy()
    } finally {
      s.done()
    }
  })
  it('a probes/*.mjs file adds a probe', () => {
    const s = scratchLib()
    try {
      put(s.dir, 'page-layout/probes/zz-demo.mjs', "export default { name: 'zz-demo', key: 'zzDemo', source: '(() => 1)()' }\n")
      const p = load(s.dir).PROBES.find((x) => x.name === 'zz-demo')
      expect(p?.key).toBe('zzDemo')
    } finally {
      s.done()
    }
  })
  it('a scenarios/*.mjs file adds its scenarios and their setups; a missing setup or a repeated name throws', () => {
    const mod = (name: string, setup: string, setups: string) =>
      `export default { scenarios: [{ name: '${name}', route: '/shop', start: '/shop', setup: '${setup}', widths: [390] }], setups: { ${setups} } }\n`
    let s = scratchLib()
    try {
      put(s.dir, 'page-layout/scenarios/zz-demo.mjs', mod('zz-demo', 'zzDemo', 'zzDemo: async () => {}'))
      const api = load(s.dir)
      expect(api.SCENARIOS.map((x) => x.name)).toContain('zz-demo')
      expect(typeof api.SETUPS.zzDemo).toBe('function')
      expect(api.selectScenarios(api.SCENARIOS, 'zz-demo').map((x) => x.name)).toEqual(['zz-demo'])
    } finally {
      s.done()
    }
    s = scratchLib()
    try {
      put(s.dir, 'page-layout/scenarios/zz-demo.mjs', mod('zz-demo', 'noSuchSetup', 'other: async () => {}'))
      expect(() => load(s.dir)).toThrow(/noSuchSetup/)
    } finally {
      s.done()
    }
    s = scratchLib()
    try {
      put(s.dir, 'page-layout/scenarios/zz-a.mjs', mod('shop-hints', 'zzA', 'zzA: async () => {}'))
      expect(() => load(s.dir)).toThrow(/shop-hints/)
    } finally {
      s.done()
    }
  })
})

describe('one module per in-page probe', () => {
  const want: [string, string | null][] = [
    ['layout', null], ['buttons', 'lowContrastButtons'], ['nav', 'navOverlap'], ['tiles', 'tileOverflow'], ['chips', 'clippedChips'],
    ['crushed-chips', 'crushedChips'], ['cut-meta', 'cutMeta'], ['actions', 'actionLayout'], ['dialog', 'dialog'], ['fit-lines', 'fitLines'],
    ['clipped-rings', 'clippedRings'], ['popover-align', 'popoverAlign'], ['filter-spacing', 'filterSpacing'], ['cut-selects', 'cutSelects'],
  ]
  it('PROBES holds the thirteen metrics probes and the base layout probe, by name and field', () => {
    for (const [name, key] of want) expect(registry.PROBES.find((p) => p.name === name)?.key, name).toBe(key)
    expect(registry.PROBES.filter((p) => p.key === null).length).toBe(1)
  })
  it('every source is a script that compiles; the dialog probe runs from 768 px', () => {
    for (const p of registry.PROBES) {
      expect(typeof p.source, p.name).toBe('string')
      expect(() => new Script(p.source), p.name).not.toThrow()
    }
    expect(registry.PROBES.find((p) => p.name === 'dialog')?.minWidth).toBe(768)
  })
  it('the probes read what the rules read: every metrics field a rule uses has a probe', () => {
    const keys = registry.PROBES.map((p) => p.key)
    for (const k of ['lowContrastButtons', 'navOverlap', 'tileOverflow', 'clippedChips', 'crushedChips', 'cutMeta', 'actionLayout', 'fitLines', 'clippedRings', 'popoverAlign', 'filterSpacing', 'cutSelects', 'dialog']) {
      expect(keys, k).toContain(k)
    }
  })
  it('the nav probe stays the one file scripts/lib/page-layout-nav-probe.js (the static fixtures of ds-layout_test.sh run it too)', () => {
    expect(fs.existsSync(lib('page-layout-nav-probe.js'))).toBe(true)
    expect(registry.PROBES.find((p) => p.name === 'nav')?.source).toContain('feederNavProbe')
  })
  it('the driver holds no in-page probe source any more, only the loop that runs PROBES and the scenario setups helpers', () => {
    const own = fs.readFileSync(resolve(cwd, '../scripts/check-page-layout.mjs'), 'utf8')
    expect(own).not.toMatch(/const \w*[pP]robe = `/)
    expect(own).toMatch(/PROBES/)
    // fast-checks: the driver also splits its work in units for the parallel workers (claims, resets, results): 640 lines.
    expect(own.split('\n').length).toBeLessThan(640)
    expect(driverSource().length).toBeGreaterThan(own.length)
  })
})

describe('one module per package for the scenarios, and their setups', () => {
  const dir = lib('page-layout', 'scenarios')
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.mjs')) : []
  it('scenarios/ starts with the five areas of beta.7 and beta.8', () => {
    for (const f of ['filtered', 'supplies', 'shop', 'scan', 'receipt']) expect(files, f).toContain(`${f}.mjs`)
  })
  it.each(files.map((f) => [f] as const))('%s default-exports { scenarios, setups } and every setup it names is in it', (f) => {
    const m = (req(resolve(dir, f)) as { default: { scenarios: Scenario[]; setups: Record<string, unknown> } }).default
    expect(Array.isArray(m.scenarios)).toBe(true)
    for (const s of m.scenarios) if (s.setup) expect(typeof m.setups[s.setup], `${f}: ${s.name} -> ${s.setup}`).toBe('function')
    for (const fn of Object.values(m.setups)) expect((fn as (h?: unknown) => unknown).length).toBeLessThanOrEqual(1)
  })
  it('SETUPS holds every setup the old driver had (its names are in the scenarios)', () => {
    const names = new Set((golden('exports.json').SCENARIOS as Scenario[]).map((s) => s.setup).filter(Boolean) as string[])
    for (const n of names) expect(typeof registry.SETUPS[n], n).toBe('function')
  })
})

describe('--scenario: selectScenarios', () => {
  const list = [{ name: 'a', route: '/a' }, { name: 'b', route: '/b' }, { name: 'c', route: '/c' }]
  it('no filter keeps the list', () => {
    expect(registry.selectScenarios(list, undefined)).toEqual(list)
    expect(registry.selectScenarios(list, '')).toEqual(list)
  })
  it('a name, or a comma list of names, keeps those', () => {
    expect(registry.selectScenarios(list, 'b').map((s) => s.name)).toEqual(['b'])
    expect(registry.selectScenarios(list, 'c,a').map((s) => s.name).sort()).toEqual(['a', 'c'])
  })
  it('an unknown name throws and names it and the known ones', () => {
    expect(() => registry.selectScenarios(list, 'a,nope')).toThrow(/nope/)
    expect(() => registry.selectScenarios(list, 'nope')).toThrow(/known.*a/i)
  })
  it('every real scenario can be selected by its name', () => {
    for (const s of registry.SCENARIOS) expect(registry.selectScenarios(registry.SCENARIOS, s.name)).toEqual([s])
  })
})

describe('profiles and viewports (plan section 9)', () => {
  const v = (width: number, height: number, mobile: boolean): Viewport => ({ width, height, mobile })
  it('quick: 375x667 (the smallest supported width), 390x844, 834x1194, 1024x1366, 1440x900, 1920x1080', () => {
    expect(facade.PROFILES.quick).toEqual([v(375, 667, true), v(390, 844, true), v(834, 1194, false), v(1024, 1366, false), v(1440, 900, false), v(1920, 1080, false)])
  })
  // Ruling of the main session (2026-11-14): full keeps 2560x1440 (the plan's list omitted it by oversight; the Kitchen board is reviewed there).
  it('full: 375x667, 390x844, 430x932, 844x390, 820x1180, 1180x820, 1440x900, 1920x1080, 2560x1440', () => {
    expect(facade.PROFILES.full).toEqual([
      v(375, 667, true), v(390, 844, true), v(430, 932, true), v(844, 390, true), v(820, 1180, false), v(1180, 820, false), v(1440, 900, false), v(1920, 1080, false),
      v(2560, 1440, false),
    ])
  })
  // The user's ruling (2026-11-14): 375 px is the smallest supported width.
  it('no profile viewport is narrower than 375 px', () => {
    for (const vp of [...facade.PROFILES.quick, ...facade.PROFILES.full]) expect(vp.width).toBeGreaterThanOrEqual(375)
  })
  // The user's instruction for w0b: no guard viewport OF ANY KIND narrower than 375 px: scenario viewports and the resize walks too.
  it('no scenario viewport, scenario width or resize-walk width is narrower than 375 px', () => {
    for (const [k, vp] of Object.entries(facade.SCENARIO_VIEWPORTS)) expect(vp.width, k).toBeGreaterThanOrEqual(375)
    const f = facade as unknown as { RESIZE_WALKS: { from: number }[]; resizeWalkWidths: () => number[]; resizeSweepWidths: () => number[] }
    for (const w of f.RESIZE_WALKS) expect(w.from).toBeGreaterThanOrEqual(375)
    expect(Math.min(...f.resizeWalkWidths(), ...f.resizeSweepWidths())).toBe(375)
  })
  it('scenario-only viewports: 667x375 (the smallest phone in landscape), 375x256 (400 % zoom of a 1500 px window), 844x390 with a safe-area inset', () => {
    expect(facade.SCENARIO_VIEWPORTS['667x375']).toEqual(v(667, 375, true))
    expect(facade.SCENARIO_VIEWPORTS['375x256']).toEqual(v(375, 256, false))
    const inset = facade.SCENARIO_VIEWPORTS['844x390-inset']!
    expect([inset.width, inset.height, inset.mobile]).toEqual([844, 390, true])
    const a = inset.safeArea!
    for (const side of [a.top, a.right, a.bottom, a.left]) expect(side).toBeGreaterThanOrEqual(0)
    expect(a.left).toBeGreaterThan(0)
    expect(a.right).toBeGreaterThan(0)
    expect(a.bottom).toBeGreaterThan(0)
  })
  it('a scenario names its viewports by number (the old ones) or by key', () => {
    const s = { name: 'x', route: '/', widths: [390, '667x375', '375x256', '844x390-inset'] }
    expect(facade.scenarioViewports(s, []).map((x) => [x.width, x.height])).toEqual([[390, 844], [667, 375], [375, 256], [844, 390]])
    expect(() => facade.scenarioViewports({ ...s, widths: ['7x7'] }, [])).toThrow(/7x7/)
  })
  it('the driver emulates through emulationCalls(vp): metrics, plus Emulation.setSafeAreaInsetsOverride when the viewport has an inset', () => {
    const { emulationCalls } = req(lib('page-layout', 'viewport.mjs')) as { emulationCalls: (vp: Viewport) => { method: string; params: Record<string, unknown> }[] }
    expect(emulationCalls(v(390, 844, true))).toEqual([{ method: 'Emulation.setDeviceMetricsOverride', params: { width: 390, height: 844, deviceScaleFactor: 1, mobile: true } }])
    const calls = emulationCalls({ ...v(844, 390, true), safeArea: { top: 0, right: 47, bottom: 21, left: 47 } })
    expect(calls[0]!.method).toBe('Emulation.setDeviceMetricsOverride')
    expect(calls[1]).toEqual({ method: 'Emulation.setSafeAreaInsetsOverride', params: { insets: { top: 0, left: 47, bottom: 21, right: 47 } } })
    expect(calls.length).toBe(2)
    expect(fs.readFileSync(resolve(cwd, '../scripts/check-page-layout.mjs'), 'utf8')).toMatch(/emulationCalls/)
  })
})
