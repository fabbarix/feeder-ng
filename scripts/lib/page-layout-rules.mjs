// R2-L: the pure part of the page-layout guard (route table, modes, profiles, viewports, walks).
// Design: docs/dev/design/r2l-page-layout.md. The CDP driver is scripts/check-page-layout.mjs and only calls these.
// Unit-tested from vitest (web/src/app/pageLayoutRules.test.ts), which also proves ROUTES equals web/src/app/pageWidths.ts.
// B9-03: this file is the one import of the driver and of the tests, and a facade. The rules, the in-page probes and the scenarios live
// in scripts/lib/page-layout/ (registry.mjs, rules/, probes/, scenarios/), one module each; it re-exports the registry and keeps only
// its own pure helpers here.
import { RULES, RESERVED, ALWAYS_FAIL, PROBES, DARK_PROBES, SCENARIOS, SETUPS, evaluateMetrics, evaluateDarkMetrics, selectScenarios } from './page-layout/registry.mjs'
import { darkButtonFindings } from './page-layout/rules/P10-button-contrast.mjs'
import { PAGE_WIDTH_PX } from './page-layout/constants.mjs'

export { RULES, RESERVED, ALWAYS_FAIL, PROBES, DARK_PROBES, SCENARIOS, SETUPS, evaluateMetrics, evaluateDarkMetrics, selectScenarios, darkButtonFindings, PAGE_WIDTH_PX }

/** [route pattern, width kind]; ":id" is resolved with resolveRoute(). Must equal web/src/app/pageWidths.ts (contract test). */
export const ROUTES = [
  ['/', 'wide'], ['/plan', 'wide'], ['/plan/couldnt-plan/excluded', 'default'], ['/shop', 'wide'], ['/scan', 'narrow'], ['/pantry', 'default'],
  ['/recipes', 'wide'], ['/recipes/:id', 'default'], ['/recipes/:id/edit', 'default'], ['/recipes/new', 'default'],
  ['/recipes/import', 'narrow'], ['/recipes/export', 'narrow'], ['/ingredients', 'narrow'], ['/ingredients/:id', 'narrow'],
  ['/supplies', 'narrow'], ['/supplies/:id', 'narrow'], ['/scan/receipt', 'narrow'], ['/scan/receipt/review', 'narrow'],
  ['/products', 'narrow'], ['/products/:id', 'narrow'], ['/settings', 'narrow'], ['/settings/household', 'narrow'],
  ['/settings/members', 'narrow'], ['/settings/meal-slots', 'default'], ['/settings/courses', 'narrow'], ['/settings/planning', 'narrow'], ['/settings/tags', 'narrow'],
  ['/settings/shops', 'narrow'], ['/settings/shops/:id', 'narrow'], ['/settings/notifications', 'narrow'],
  ['/settings/allowlist', 'narrow'], ['/settings/preferences', 'narrow'], ['/settings/access-requests', 'narrow'],
  ['/settings/recipe-assistant', 'narrow'], ['/board', 'full'],
]

/**
 * beta.7: the viewport of a scenario width (a scenario with `widths` runs at exactly those, in both profiles). The phone widths are
 * emulated as phones, as the profiles' 390 px is; 834 is the iPad portrait of the quick profile.
 */
export const SCENARIO_VIEWPORTS = {
  // The user's ruling of 2026-11-14 (no guard viewport narrower than 375 px): the beta.7/beta.8 scenarios' smallest phone moved from
  // 360x780 to 375x667, the profiles' smallest viewport.
  375: { width: 375, height: 667, mobile: true },
  390: { width: 390, height: 844, mobile: true },
  834: { width: 834, height: 1194, mobile: false },
  1440: { width: 1440, height: 900, mobile: false },
  // B9-03 (plan section 9; the user's ruling of 2026-11-14: no guard viewport is narrower than 375 px), scenario-only: the smallest
  // phone in landscape; 400 % zoom of a 1500 px window (375 CSS px wide, a desktop, not a phone); and a notched phone in landscape, whose safe-area insets the driver emulates (viewport.mjs).
  '667x375': { width: 667, height: 375, mobile: true },
  '375x256': { width: 375, height: 256, mobile: false },
  '844x390-inset': { width: 844, height: 390, mobile: true, safeArea: { top: 0, right: 47, bottom: 21, left: 47 } },
  // B9-14 (SHORT-02's sizes): phone landscape without insets, and a 390 px phone with the on-screen keyboard up (400 px left).
  '844x390': { width: 844, height: 390, mobile: true },
  '390x400': { width: 390, height: 400, mobile: true },
}

// B9-03: a scenario module that names a viewport this table lacks fails on load, not halfway through a run.
for (const s of SCENARIOS) {
  for (const w of s.widths ?? []) {
    if (!SCENARIO_VIEWPORTS[w]) throw new Error(`page-layout: scenario ${s.name}: no viewport ${JSON.stringify(w)} in SCENARIO_VIEWPORTS (${Object.keys(SCENARIO_VIEWPORTS).join(', ')})`)
  }
}

/**
 * The viewports a scenario runs at: its own `widths`, or every viewport of the profile (the filtered /recipes and /pantry). A width is a
 * number (the old phone, tablet and desktop widths) or a SCENARIO_VIEWPORTS key ('667x375', '375x256', '844x390-inset').
 */
export function scenarioViewports(scenario, profileViewports) {
  if (!scenario.widths) return profileViewports
  return scenario.widths.map((w) => {
    const vp = SCENARIO_VIEWPORTS[w]
    if (!vp) throw new Error(`scenario ${scenario.name}: no viewport for ${w} in SCENARIO_VIEWPORTS`)
    return vp
  })
}

/**
 * hf-recipes-filter round 3 (docs/design/recipes-filter.md 14): the closed filtered /recipes is loaded fresh at each of these phone
 * widths, and the page must not break at any (P21: an uncaught exception, a console error, or the error page). The walk starts at
 * 375 px (the user's ruling of 2026-11-14: no guard viewport narrower than 375; it started at 360), then keeps the 10 px grid.
 */
export const RESIZE_WALK = { scenario: 'recipes-filtered', from: 375, to: 480, step: 10 }

/** pantry-filter: every walk the guard runs (fresh loads, then the live 1 px sweep): the filtered /recipes and the filtered /pantry. */
export const RESIZE_WALKS = [RESIZE_WALK, { ...RESIZE_WALK, scenario: 'pantry-filtered' }]

/**
 * The findings of one walked width: P21 from the runtime errors and the error page the walk saw there, and (pantry-filter review) P22
 * from the chip Selects whose value was cut there (`cutSelects`, the driver's cutSelectProbe). Only these two are read from a walk.
 */
export function resizeWalkFindings(runtimeErrors, { width, route }, cutSelects = []) {
  const walked = {
    vw: width, scrollW: width, clientW: width, over: [], content: { x: 0, r: width }, railR: 0, container: { x: 0, r: width },
    pageWidthAttr: 'wide', fields: [], bars: [], railContrast: null, dialog: null, brokenText: [], runtimeErrors, cutSelects,
  }
  return evaluateMetrics(walked, { width, route, kind: 'wide' }).filter((f) => f.rule === 'P21' || f.rule === 'P22')
}

/**
 * Review of round 3: the same scenario resized live in one page, 1 px at a time, from the walk's widest width down to its narrowest
 * and back up, with `pauseMs` after each step (P21 "(live resize)"). It catches a window narrower than the walk's step, and the
 * resize path that a fresh load never takes.
 */
export const RESIZE_SWEEP = { step: 1, pauseMs: 40 }

/** The widths of the RESIZE_SWEEP, in order: RESIZE_WALK.to down to RESIZE_WALK.from, then back up (every walk has the same range). */
export function resizeSweepWidths() {
  const down = []
  for (let w = RESIZE_WALK.to; w >= RESIZE_WALK.from; w -= RESIZE_SWEEP.step) down.push(w)
  return [...down, ...down.slice(0, -1).reverse()]
}

/** The widths of the RESIZE_WALK, in order: `from`, then every multiple of `step` above it up to `to` (375, 380, 390, …, 480). */
export function resizeWalkWidths() {
  const out = [RESIZE_WALK.from]
  for (let w = (Math.floor(RESIZE_WALK.from / RESIZE_WALK.step) + 1) * RESIZE_WALK.step; w <= RESIZE_WALK.to; w += RESIZE_WALK.step) out.push(w)
  return out
}

/** The URL of a scenario: its `start`, or /recipes with the Side Course and the long Tag, /pantry with Use soon and the long Storage Place (ids file). */
export function resolveScenario(scenario, ids) {
  // beta.7: a scenario with a `start` opens that route (":id" from the ids file) and its setup takes it from there.
  if (scenario.start) return resolveRoute(scenario.start, ids)
  const params =
    scenario.route === '/pantry'
      ? new URLSearchParams({ status: 'useSoon', place: String(ids.longPlaceId) })
      : new URLSearchParams({ course: String(ids.sideCourseId), tag: String(ids.longTag) })
  return `${scenario.route}?${params.toString()}`
}

/**
 * quick = what scripts/check.sh runs, iPad portrait included (DS-A, ADR 0016); full = the viewports of the UI review (PAGE_LAYOUT=full).
 * B9-03 (plan section 9; the user's ruling of 2026-11-14: 375 px is the smallest supported width): 375x667 in both, and no profile
 * viewport is narrower; 430x932 and 844x390 (a phone in landscape) in full.
 * Full keeps 2560x1440, where the Kitchen board is reviewed (ruling of the main session, 2026-11-14).
 */
export const PROFILES = {
  quick: [
    { width: 375, height: 667, mobile: true },
    { width: 390, height: 844, mobile: true },
    { width: 834, height: 1194, mobile: false },
    { width: 1024, height: 1366, mobile: false },
    { width: 1440, height: 900, mobile: false },
    { width: 1920, height: 1080, mobile: false },
  ],
  full: [
    { width: 375, height: 667, mobile: true },
    { width: 390, height: 844, mobile: true },
    { width: 430, height: 932, mobile: true },
    { width: 844, height: 390, mobile: true },
    { width: 820, height: 1180, mobile: false },
    { width: 1180, height: 820, mobile: false },
    { width: 1440, height: 900, mobile: false },
    { width: 1920, height: 1080, mobile: false },
    { width: 2560, height: 1440, mobile: false },
  ],
}

const channels = (c) => (String(c).match(/[\d.]+/g) || []).map(Number)
const lum = ([r, g, b]) => {
  const f = (v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** WCAG contrast ratio of two CSS colours ("rgb(...)" / "rgba(...)"); alpha is ignored. */
export function contrastRatio(fg, bg) {
  const [x, y] = [lum(channels(fg)), lum(channels(bg))].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

const segs = (p) => String(p).split(/[?#]/)[0].split('/').filter(Boolean)
function patternMatches(pattern, route) {
  const p = segs(pattern)
  const r = segs(route)
  const wildcard = p[p.length - 1] === '*'
  const fixed = wildcard ? p.slice(0, -1) : p
  if (wildcard ? r.length < fixed.length : r.length !== fixed.length) return false
  return fixed.every((s, i) => s.startsWith(':') || s === r[i])
}

/**
 * The text of scripts/check-page-layout.modes (and its .d files), parsed. Every line that is not blank or a comment is one of:
 *   default=warn|fail                    the mode of a route in no list
 *   fail_routes=PATTERN ...              these routes fail (several lines of a key are unioned, so every team can add its own line)
 *   warn_routes=PATTERN ...              these routes warn, and win over fail_routes
 *   width<=N = warn [until B9-NN]        B9-03, the warn bridge: every finding at a profile viewport N px wide or less is a warning,
 *                                        always-fail rules included; scenario findings ("<route>#<name>") are not affected
 * Anything else is an error ({ line, text, why }): a mistyped key must never be dropped in silence.
 */
export function parseModes(modesText) {
  const out = { dflt: 'warn', failRoutes: [], warnRoutes: [], widthWarn: [], errors: [] }
  String(modesText)
    .split('\n')
    .forEach((raw, i) => {
      const line = raw.trim()
      if (!line || line.startsWith('#')) return
      const err = (why) => out.errors.push({ line: i + 1, text: line, why })
      const bridge = /^width\s*<=/.exec(line)
      if (bridge) {
        const m = /^width\s*<=\s*(\d+)\s*=\s*warn(?:\s+until\s+(\S+))?$/.exec(line)
        if (!m) return err('a width line reads "width<=N = warn" or "width<=N = warn until B9-NN"')
        out.widthWarn.push({ max: Number(m[1]), until: m[2] ?? null })
        return
      }
      const eq = line.indexOf('=')
      if (eq < 0) return err('not a key=value line')
      const key = line.slice(0, eq).trim()
      const value = line.slice(eq + 1).trim()
      if (key === 'default') {
        if (value !== 'warn' && value !== 'fail') return err('default is warn or fail')
        out.dflt = value
      } else if (key === 'fail_routes') out.failRoutes.push(...value.split(/\s+/).filter(Boolean))
      else if (key === 'warn_routes') out.warnRoutes.push(...value.split(/\s+/).filter(Boolean))
      else err(`unknown key "${key}" (default, fail_routes, warn_routes or width<=N)`)
    })
  return out
}

/** 'warn' | 'fail' for a (resolved) route from the text of scripts/check-page-layout.modes. `warn_routes` win over `fail_routes`; repeated lines of a key are unioned. */
export function modeFor(modesText, route) {
  const { dflt, failRoutes, warnRoutes } = parseModes(modesText)
  if (warnRoutes.some((pat) => patternMatches(pat, route))) return 'warn'
  if (failRoutes.some((pat) => patternMatches(pat, route))) return 'fail'
  return dflt
}

/**
 * B9-03, the warn bridge: the `width<=N = warn` line that covers a finding at `width` on `label` (the finding line's route token), or
 * null. The widest N applies. A scenario label ("<route>#<name>") is never covered: its viewport is the scenario's own.
 */
export function widthBridgeFor(modesText, width, label) {
  if (String(label).includes('#')) return null
  const hits = parseModes(modesText).widthWarn.filter((b) => width <= b.max)
  return hits.length ? hits.reduce((a, b) => (b.max > a.max ? b : a)) : null
}

/**
 * The guard's output read against the modes: { fail, bridged: [{ max, until, n }] }. A finding line fails when its rule is in
 * ALWAYS_FAIL or its route is in fail mode, unless a width<=N line covers it (then it is counted in `bridged`).
 */
export function countFindings(modesText, output) {
  let fail = 0
  const bridged = new Map()
  for (const line of String(output).split('\n')) {
    const m = /^\s+- (\d+)px (\S+): (P\d+) /.exec(line)
    if (!m) continue
    const b = widthBridgeFor(modesText, Number(m[1]), m[2])
    if (b) {
      const k = `${b.max}\t${b.until ?? ''}`
      bridged.set(k, (bridged.get(k) ?? 0) + 1)
      continue
    }
    if (ALWAYS_FAIL.includes(m[3]) || modeFor(modesText, m[2]) === 'fail') fail++
  }
  for (const b of parseModes(modesText).widthWarn) {
    const k = `${b.max}\t${b.until ?? ''}`
    if (!bridged.has(k)) bridged.set(k, 0)
  }
  return { fail, bridged: [...bridged].map(([k, n]) => ({ max: Number(k.split('\t')[0]), until: k.split('\t')[1] || null, n })) }
}

const ID_KEYS = { recipes: 'recipeId', ingredients: 'ingredientId', products: 'productId', shops: 'shopId', supplies: 'supplyId' }
/** Replaces ":id" with the seeded id of the entity named by the preceding path segment. */
export function resolveRoute(pattern, ids) {
  const parts = pattern.split('/')
  return parts.map((s, i) => (s === ':id' ? String(ids[ID_KEYS[parts[i - 1]]] ?? 1) : s)).join('/')
}
