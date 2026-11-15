// fast-checks (the parallel guard): the guard's work split in units, and the report of a run made of several drivers' results.
// A unit is what one driver runs on a fresh copy of the seeded database (scripts/check-page-layout.sh restarts the worker's server
// before each): a route of the route table at every profile viewport, a scenario at its viewports (the profile's, or its own widths),
// or a resize walk (its fresh loads and its live sweep). Units never share server state, so they can run in any order, on any worker.
import { coverageSummary, notInspectedLine } from '../page-layout-coverage.mjs'

/**
 * The units of a run, longest first (so the last unit a worker takes is a short one): [{ n, id, kind, pattern?, scenario?, walk?,
 * cost }]. `only` is the PAGE_LAYOUT_ONLY regex (or null). The probe count of a unit is its cost's first factor; a setup costs double
 * (it runs again for the dark pass).
 */
export function planUnits({ routes, scenarios, viewports, walks, walkWidths, sweepWidths, scenarioViewports, only = null }) {
  const keep = (route) => !only || new RegExp(only).test(route)
  const units = []
  for (const [pattern] of routes) if (keep(pattern)) units.push({ id: `route ${pattern}`, kind: 'route', pattern, probes: viewports.length, cost: viewports.length })
  for (const scenario of scenarios) {
    if (!keep(scenario.route)) continue
    const n = scenario.widths ? scenarioViewports(scenario, viewports).length : viewports.length
    units.push({ id: `scenario ${scenario.name}`, kind: 'scenario', scenario: scenario.name, probes: n, cost: n * (scenario.setup ? 2 : 1) })
  }
  for (const walk of walks) {
    const named = scenarios.find((x) => x.name === walk.scenario)
    if (!named || !keep(named.route)) continue
    units.push({ id: `walk ${walk.scenario}`, kind: 'walk', walk: walk.scenario, probes: walkWidths.length + 1, cost: walkWidths.length + sweepWidths.length / 20 })
  }
  units.forEach((u, i) => (u.n = i))
  return [...units].sort((a, b) => b.cost - a.cost || a.n - b.n)
}

/**
 * The summary a run prints, from its units' results (one driver's, or several merged): the findings and not-inspected lines in unit
 * order, the coverage line, and the verdict line. Returns { lines, bad } (bad: findings or failing not-inspected entries).
 */
export function reportLines({ results, exemptions, profileName, seconds }) {
  const ordered = [...results].sort((a, b) => a.n - b.n)
  const probes = ordered.reduce((t, r) => t + r.probes, 0)
  const failures = ordered.flatMap((r) => r.failures)
  const notInspected = ordered.flatMap((r) => r.notInspected)
  const coverage = coverageSummary({ inspected: probes - notInspected.length, notInspected, exemptions })
  const exemptReason = (entry) => exemptions.find((x) => x.pattern === entry.pattern).reason
  const detail = [
    ...failures.map((f) => '  - ' + f),
    ...notInspected.map((entry) => (coverage.exempt.includes(entry) ? `  ~ ${entry.width}px ${entry.route}: exempt (${exemptReason(entry)})` : notInspectedLine(entry))),
  ]
  const bad = failures.length + coverage.failing.length
  const lines = []
  if (bad) lines.push(`check-page-layout: ${failures.length} failure(s), ${coverage.failing.length} not inspected (${profileName} profile, ${seconds}s)`)
  lines.push(...detail)
  lines.push(coverage.line)
  if (!bad) lines.push(`check-page-layout: OK (${probes} probes, ${seconds}s)`)
  return { lines, bad, probes }
}
