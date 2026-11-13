// Coverage of the page-layout guard: which route x viewport probes were not inspected, and whether that fails the run.
// Pure functions (no DOM, no I/O), unit-tested by scripts/test/check-page-layout-coverage_test.sh.
// Design: docs/dev/design/b5-pl.md. A route that cannot be probed must be listed in scripts/check-page-layout.exempt with a reason.
import { ROUTES } from './page-layout-rules.mjs'

/**
 * Parses the exemption list: one "<route pattern> <reason>" per line, '#' comments and blank lines ignored.
 * The pattern must be a ROUTES pattern and the reason must not be empty; anything else throws.
 * @returns {{pattern: string, reason: string}[]}
 */
export function parseExemptions(text, routes = ROUTES) {
  const known = new Set(routes.map(([pattern]) => pattern))
  const out = []
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const m = /^(\S+)\s*(.*)$/.exec(line)
    const pattern = m[1]
    const reason = m[2].trim()
    if (!known.has(pattern)) {
      throw new Error(`check-page-layout.exempt line ${i + 1}: "${pattern}" is not a route pattern in scripts/lib/page-layout-rules.mjs`)
    }
    if (!reason) throw new Error(`check-page-layout.exempt line ${i + 1}: the exemption for ${pattern} needs a reason`)
    out.push({ pattern, reason })
  })
  return out
}

/**
 * Summarises coverage. `inspected` counts the probes that ran; `notInspected` holds one entry per probe that did not
 * ({width, route, pattern, reason}). An entry whose pattern is exempt is reported but does not fail.
 */
export function coverageSummary({ inspected, notInspected, exemptions }) {
  const isExempt = (entry) => exemptions.some((x) => x.pattern === entry.pattern)
  const exempt = notInspected.filter(isExempt)
  const failing = notInspected.filter((entry) => !isExempt(entry))
  const total = inspected + notInspected.length
  const line =
    `check-page-layout: coverage: inspected ${inspected} of ${total} ` +
    `(not inspected ${notInspected.length}: ${exempt.length} exempt, ${failing.length} failing)`
  return { ok: failing.length === 0, total, failing, exempt, line }
}

/** The output line for one probe that was not inspected. */
export function notInspectedLine(entry) {
  return `  ! ${entry.width}px ${entry.route}: not inspected (${entry.reason})`
}
