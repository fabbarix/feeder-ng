// B9-03 (guard-split, docs/design/ui-remediation-plan-3.md sections 5, 6 and 9): the page-layout guard's registry. Every rule, in-page
// probe and scenario is its own module, and a package adds ITS OWN files here instead of editing a shared one:
//   rules/Pnn-<slug>.mjs     default { id: 'Pnn', title, always, evaluate(metrics, { width, route, kind }) -> [{ rule, message }],
//                            evaluateDark?(darkMetrics, ctx) -> [...] }: evaluateDark reads the `dark` probes re-run in the dark scheme
//                            The file's number is the id's. P1..P43 only; P24..P43 are RESERVED (owner, mode) until their package adds
//                            the module. `always: true` puts the rule in ALWAYS_FAIL (it fails on warn routes too).
//   probes/<slug>.mjs        default { name, key, source, order?, minWidth?, soft?, dark?, scenarios? }: `source` is page code the driver evaluates, `key` the
//                            metrics field it fills (null: the base layout metrics). The driver runs them by `order` (then name), from
//                            `minWidth` px; a `soft` probe that throws gives null instead of losing the page. A `dark` probe runs again
//                            in the dark pass, into the darkMetrics the rules' evaluateDark read. A probe with `scenarios` (names) runs
//                            only on those scenarios' pages.
//   scenarios/<slug>.mjs     default { order?, scenarios: [...], setups: { <name>: async (h) => void } }; a scenario is { name, route,
//                            open? } (every profile viewport) or { name, route, start, widths, setup?, emulate?: [CDP calls before the
//                            first navigation], rules?: [ids: only these findings are reported] }; ctx.scenario names it for the rules: the scenarios run by `order`
//                            (then file name; setups change server state, so the order is kept), each setup in the page opened at the
//                            scenario's start (h: helpers.mjs).
// Modules load SYNCHRONOUSLY (readdirSync + createRequire): the facade is loaded by vitest through require(esm), which cannot await.
// A module that breaks a rule above throws on load, naming the file.
import { readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const load = createRequire(import.meta.url)

/** The default exports of the .mjs files of a subdirectory, by file name. */
function modulesIn(dir) {
  let names
  try {
    names = readdirSync(join(here, dir))
  } catch {
    return []
  }
  // Only .mjs modules are loaded; any other file (a .js, a .ts, a backup) is a mistake that would be skipped in silence, so it throws.
  // Dotfiles (.gitkeep) are allowed.
  const strays = names.filter((n) => !n.startsWith('.') && !n.endsWith('.mjs'))
  if (strays.length) throw new Error(`page-layout: ${dir}/${strays.join(`, ${dir}/`)}: only .mjs modules go in ${dir}/`)
  return names
    .filter((n) => n.endsWith('.mjs'))
    .sort()
    .map((n) => {
      const mod = load(join(here, dir, n)).default
      if (!mod || typeof mod !== 'object') throw new Error(`page-layout: ${dir}/${n} has no default export object`)
      return { file: n, mod }
    })
}

/** Plan section 9: the rule numbers a package of beta.9 adds, with its owner and its mode ('mode' = by the route mode, until B9-55). */
// B9-55: every rule planned "by mode -> B9-55" is always fail at release (plan section 9).
const PLANNED = [
  ['P24', 'B9-13', 'always', "A row's title paints over its meta (DS-05)"],
  ['P25', 'B9-14', 'always', 'A target under 44 px in an open sheet, two overlapping targets, or touching bottom-bar labels (DS-01, DS-02)'],
  ['P26', 'B9-07', 'always', 'A BentoGrid loses a column as the window widens (resize walk) (DS-09)'],
  ['P27', 'B9-02', 'always', 'At a 24 px text size: off-role text, or a heading larger than the page title (DS-07, DS-08)'],
  ['P28', 'B9-13', 'always', 'A two-line navigation description is cut (DS-10)'],
  ['P29', 'B9-01', 'always', 'An action in a tile, toast, sheet footer, dialog or banner whose boundary is under 3:1 (R-A)'],
  ['P30', 'B9-01', 'always', 'A Segmented option on two lines (and [data-one-line] buttons)'],
  ['P31', 'B9-19', 'always', 'A bottom-bar squircle that is not square, or not 6 px inside the bar (R-F)'],
  ['P32', 'B9-19', 'always', 'Fixed and sticky chrome covers more than 35 % of the viewport height at load (SHORT)'],
  ['P33', 'B9-14', 'always', 'A sheet body under min(96px, 30 % of innerHeight), or a footer visible while the first required control is clipped (SHORT-02)'],
  ['P34', 'B9-40', 'always', 'Cook Step text not visible outside the Back/Next tiles at load (SHORT-01)'],
  ['P35', 'B9-19', 'always', 'Content inside a safe-area inset (SHORT-05; the inset scenario)'],
  ['P36', 'B9-16', 'always', 'A target under 44 px on touch profiles (A11Y-09)'],
  ['P37', 'B9-49', 'always', 'document.title is "Feeder", or does not match the h1 (A11Y-01)'],
  ['P38', 'B9-32', 'always', 'Two visible buttons in main share a name (A11Y-08)'],
  ['P39', 'B9-07', 'always', "A focused control's ring box is clipped, or touches a neighbour or a sticky bar (A11Y-02)"],
  ['P40', 'B9-13', 'always', 'A .list-row__title or a field error narrower than 120 px (SET)'],
  ['P41', 'B9-13', 'always', 'A grouped list without a visible ListGroup title (SSP-03)'],
  ['P42', 'B9-44', 'always', 'A .page-header__subtitle other than the household date on Today (RES-05)'],
  ['P43', 'B9-18', 'always', 'A toast covers the row being acted on ([data-pricing], the focused row) (SSP-12)'],
]
const MAX_RULE = 43
const num = (id) => Number(String(id).slice(1))

// ------------------------------------------------------------------------------------------------------------------------------ rules
const ruleModules = []
for (const { file, mod } of modulesIn('rules')) {
  const m = /^P(\d+)-[a-z0-9-]+\.mjs$/.exec(file)
  if (!m) throw new Error(`page-layout: rules/${file} must be named Pnn-<slug>.mjs`)
  const n = Number(m[1])
  if (n < 1 || n > MAX_RULE) throw new Error(`page-layout: rules/${file}: P${n} is outside P1..P${MAX_RULE}`)
  if (mod.id !== `P${n}`) throw new Error(`page-layout: rules/${file} says id ${mod.id}; the file is P${n}`)
  if (typeof mod.evaluate !== 'function' || typeof mod.always !== 'boolean' || typeof mod.title !== 'string' || (mod.evaluateDark !== undefined && typeof mod.evaluateDark !== 'function')) {
    throw new Error(`page-layout: rules/${file} needs { id, title, always, evaluate }`)
  }
  // A reserved number's module must have the mode the plan gives it (section 9): 'always' -> always: true, 'mode' -> always: false.
  const planned = PLANNED.find(([id]) => id === mod.id)
  if (planned && (planned[2] === 'always') !== mod.always) {
    throw new Error(`page-layout: rules/${file}: ${mod.id} is planned as ${planned[2] === 'always' ? 'always fail (always: true)' : 'by the route mode (always: false)'} (${planned[1]}); change PLANNED with the plan if that changed`)
  }
  const twin = ruleModules.find((r) => r.id === mod.id)
  if (twin) throw new Error(`page-layout: two modules for ${mod.id} (rules/${twin.file} and rules/${file})`)
  ruleModules.push({ ...mod, file })
}
ruleModules.sort((a, b) => num(a.id) - num(b.id))

/** The active rules, by number. */
export const RULES = ruleModules.map(({ file: _file, ...r }) => r)
/** The ids of the rules that fail in every mode, on warn routes too. */
export const ALWAYS_FAIL = RULES.filter((r) => r.always).map((r) => r.id)
/** The rule numbers held for a package that has not added its module yet. */
export const RESERVED = PLANNED.filter(([id]) => !RULES.some((r) => r.id === id)).map(([id, owner, mode, title]) => ({ id, owner, mode, title }))

/** Findings for one probe of a page: [{ rule, message }], each message starting with its rule id. ctx = { width (viewport), route, kind }. */
export const evaluateMetrics = (m, ctx) => RULES.flatMap((r) => r.evaluate(m, ctx))
/** Findings of the dark pass: the rules with evaluateDark, by number, on the metrics of the `dark` probes. */
export const evaluateDarkMetrics = (dm, ctx) => RULES.flatMap((r) => (r.evaluateDark ? r.evaluateDark(dm, ctx) : []))

// ----------------------------------------------------------------------------------------------------------------------------- probes
const probeList = []
for (const { file, mod } of modulesIn('probes')) {
  if (typeof mod.name !== 'string' || typeof mod.source !== 'string' || !(mod.key === null || typeof mod.key === 'string')) {
    throw new Error(`page-layout: probes/${file} needs { name, key (string or null), source (page code) }`)
  }
  if (probeList.some((p) => p.name === mod.name)) throw new Error(`page-layout: two probes named "${mod.name}" (probes/${file})`)
  if (mod.dark !== undefined && (typeof mod.dark !== 'boolean' || mod.key === null)) throw new Error(`page-layout: probes/${file}: dark is true or false, and not on the layout probe`)
  if (mod.key === null && probeList.some((p) => p.key === null)) throw new Error(`page-layout: probes/${file}: only the layout probe has key null`)
  if (mod.key !== null && probeList.some((p) => p.key === mod.key)) throw new Error(`page-layout: probes/${file}: another probe already fills metrics key "${mod.key}"`)
  probeList.push(mod)
}
const ord = (x) => (typeof x.order === 'number' ? x.order : 1000)
/** The in-page probes, in the order the driver runs them. */
export const PROBES = probeList.sort((a, b) => ord(a) - ord(b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
/** The probes the dark pass runs again, in the same order. */
export const DARK_PROBES = PROBES.filter((p) => p.dark)

// -------------------------------------------------------------------------------------------------------------------------- scenarios
const scenarioModules = modulesIn('scenarios').sort((a, b) => ord(a.mod) - ord(b.mod) || (a.file < b.file ? -1 : 1))
const scenarioList = []
const setupMap = {}
for (const { file, mod } of scenarioModules) {
  if (!Array.isArray(mod.scenarios) || typeof mod.setups !== 'object' || mod.setups === null) {
    throw new Error(`page-layout: scenarios/${file} needs { scenarios: [...], setups: {...} }`)
  }
  for (const [name, fn] of Object.entries(mod.setups)) {
    if (typeof fn !== 'function') throw new Error(`page-layout: scenarios/${file}: setup ${name} is not a function`)
    if (setupMap[name]) throw new Error(`page-layout: scenarios/${file}: setup ${name} is defined twice`)
    setupMap[name] = fn
  }
  for (const s of mod.scenarios) {
    if (!s || typeof s.name !== 'string' || typeof s.route !== 'string') throw new Error(`page-layout: scenarios/${file}: a scenario needs { name, route }`)
    if (scenarioList.some((x) => x.name === s.name)) throw new Error(`page-layout: scenarios/${file}: scenario ${s.name} is defined twice`)
    // The driver runs a setup only for a scenario with its own widths, and opens such a scenario at its `start`.
    if (s.setup && !s.widths) throw new Error(`page-layout: scenarios/${file}: scenario ${s.name} has a setup but no widths (the driver runs setups only at a scenario's own widths)`)
    if (s.widths && (!Array.isArray(s.widths) || !s.widths.length || typeof s.start !== 'string')) throw new Error(`page-layout: scenarios/${file}: scenario ${s.name} with widths needs a non-empty widths list and a start route`)
    if (s.emulate !== undefined && !(Array.isArray(s.emulate) && s.emulate.every((c) => c && typeof c.method === 'string'))) throw new Error(`page-layout: scenarios/${file}: scenario ${s.name}: emulate is a list of CDP calls { method, params }`)
    if (s.rules !== undefined && !(Array.isArray(s.rules) && s.rules.length && s.rules.every((r) => /^P([1-9]|[1-3]\d|4[0-3])$/.test(r)))) throw new Error(`page-layout: scenarios/${file}: scenario ${s.name}: rules is a list of rule ids P1..P43`)
    if (s.setup && typeof mod.setups[s.setup] !== 'function') throw new Error(`page-layout: scenarios/${file}: scenario ${s.name} names setup ${s.setup}, which the module does not define`)
    scenarioList.push(s)
  }
}
for (const p of PROBES) {
  if (p.scenarios === undefined) continue
  if (!Array.isArray(p.scenarios) || !p.scenarios.length) throw new Error(`page-layout: probe ${p.name}: scenarios is a non-empty list of scenario names`)
  const unknown = p.scenarios.filter((n) => !scenarioList.some((s) => s.name === n))
  if (unknown.length) throw new Error(`page-layout: probe ${p.name} names scenario ${unknown.join(', ')}, which no scenarios/ module defines`)
}
/** Every scenario, in run order. */
export const SCENARIOS = scenarioList
/** Every setup by name. */
export const SETUPS = setupMap

/** --scenario NAME[,NAME]: the scenarios of `list` with those names (no spec: all). An unknown name throws and names the known ones. */
export function selectScenarios(list, spec) {
  if (!spec) return list
  const names = String(spec).split(',').map((s) => s.trim()).filter(Boolean)
  const unknown = names.filter((n) => !list.some((s) => s.name === n))
  if (unknown.length) throw new Error(`unknown scenario ${unknown.map((n) => `"${n}"`).join(', ')} (known: ${list.map((s) => s.name).join(', ')})`)
  return list.filter((s) => names.includes(s.name))
}
