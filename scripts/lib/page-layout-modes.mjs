#!/usr/bin/env node
// CLI over parseModes / modeFor / countFindings (page-layout-rules.mjs) for scripts/check-page-layout.sh.
//   page-layout-modes.mjs check <modes-file>                 exit 0, or exit 2 naming every line the parser does not know
//   page-layout-modes.mjs mode-of <modes-file> <route>      prints warn|fail
//   page-layout-modes.mjs count-fail <modes-file>            reads guard output on stdin, prints how many finding lines fail: on fail routes, or ALWAYS_FAIL rules anywhere,
//                                                            unless a width<=N line (the warn bridge) or a Pnn@/route line (B9-13) covers them
//   page-layout-modes.mjs bridge-notes <modes-file>          reads guard output on stdin, prints one count per width<=N line ("375 px: 4 findings, warn until B9-55")
//                                                            and per Pnn@/route line ("P41@/pantry: 3 findings, warn until B9-29")
// B9-03: the files of <modes-file>.d/ (scripts/check-page-layout.modes.d/: a package's own fail_routes / warn_routes lines) are read
// after the modes file, in name order. Lines of a key are unioned across all files, and warn_routes win over fail_routes, as in one file.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { countFindings, countRuleWarned, modeFor, parseModes } from './page-layout-rules.mjs'

const [cmd, file, route] = process.argv.slice(2)
// [name, text] of the modes file and its .d files, in reading order.
const parts = []
try {
  parts.push([file, readFileSync(file, 'utf8')])
} catch {
  /* a missing modes file means warn everywhere */
}
let dropins = []
try {
  dropins = readdirSync(`${file}.d`).filter((n) => !n.startsWith('.')).sort()
} catch {
  /* no modes.d directory */
}
for (const n of dropins) {
  try {
    parts.push([join(`${file}.d`, n), readFileSync(join(`${file}.d`, n), 'utf8')])
  } catch {
    /* a directory or an unreadable entry adds nothing */
  }
}
// B9-03: a line the parser does not know stops every command (exit 2), naming the file and the line.
const errors = parts.flatMap(([name, t]) => parseModes(t).errors.map((e) => `${name}:${e.line}: ${e.why}: ${e.text}`))
if (errors.length) {
  for (const e of errors) console.error(`page-layout-modes: ${e}`)
  process.exit(2)
}
const text = parts.map(([, t]) => t).join('\n')
if (cmd === 'check') {
  // validated above
} else if (cmd === 'mode-of') {
  console.log(modeFor(text, route ?? ''))
} else if (cmd === 'count-fail') {
  // ALWAYS_FAIL rules (horizontal overflow, P1 and P13) fail on every route, warn routes included; a width<=N line makes them warn too.
  // A Pnn@/route line makes that by-mode rule warn on that route.
  console.log(countFindings(text, readFileSync(0, 'utf8')).fail)
} else if (cmd === 'bridge-notes') {
  // One line per width<=N line: "375 px: 4 findings, warn until B9-55"; then (B9-13) one per Pnn@/route line:
  // "P41@/pantry: 3 findings, warn until B9-29". stdin is read once.
  const output = readFileSync(0, 'utf8')
  for (const b of countFindings(text, output).bridged) {
    console.log(`${b.max} px: ${b.n} finding${b.n === 1 ? '' : 's'}, warn${b.until ? ` until ${b.until}` : ''}`)
  }
  for (const w of countRuleWarned(text, output)) {
    console.log(`${w.rule}@${w.pattern}: ${w.n} finding${w.n === 1 ? '' : 's'}, warn${w.until ? ` until ${w.until}` : ''}`)
  }
} else {
  console.error('usage: page-layout-modes.mjs check <file> | mode-of <file> <route> | count-fail <file> | bridge-notes <file>')
  process.exit(2)
}
