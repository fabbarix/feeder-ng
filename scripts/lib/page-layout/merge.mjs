#!/usr/bin/env node
// fast-checks: merges the results of the parallel guard's workers (check-page-layout.mjs --result) and prints what one driver prints:
// the findings and not-inspected lines in unit order, the coverage line, and OK or the failure count.
//   node scripts/lib/page-layout/merge.mjs --exempt FILE --units N [--seconds S] RESULT.json...
// --units: how many units the run had; a unit no worker reported (a worker that died) is lost coverage and fails the merge (exit 2).
// Exit 0 OK, 1 findings or failing not-inspected entries (as the driver), 2 lost units or unreadable results.
import { readFileSync } from 'node:fs'
import { parseExemptions } from '../page-layout-coverage.mjs'
import { reportLines } from './units.mjs'

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return undefined
  const v = args[i + 1]
  args.splice(i, 2)
  return v
}
const exemptPath = opt('exempt')
const expected = Number(opt('units'))
const seconds = opt('seconds')
let exemptions
const results = []
let profileName = 'quick'
let slowest = []
try {
  exemptions = parseExemptions(readFileSync(exemptPath, 'utf8'))
  for (const file of args) {
    const r = JSON.parse(readFileSync(file, 'utf8'))
    profileName = r.profile
    results.push(...r.units)
  }
} catch (e) {
  console.log(`check-page-layout: cannot merge the workers' results (${e.message})`)
  process.exit(2)
}
const seen = new Set(results.map((r) => r.n))
if (!Number.isFinite(expected) || seen.size !== expected || results.length !== expected) {
  console.log(`check-page-layout: the workers reported ${seen.size} of ${expected} units; a worker stopped before its units were done (lost coverage)`)
  process.exit(2)
}
slowest = [...results].sort((a, b) => b.ms - a.ms).slice(0, 5)
const { lines, bad } = reportLines({ results, exemptions, profileName, seconds: seconds ?? Math.round(Math.max(...results.map((r) => r.ms), 0) / 1000) })
console.log(lines.join('\n'))
console.error(`check-page-layout: slowest units: ${slowest.map((u) => `${u.id} ${Math.round(u.ms / 1000)}s`).join(', ')}`)
process.exit(bad ? 1 : 0)
