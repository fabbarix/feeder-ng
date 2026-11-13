#!/usr/bin/env node
// CLI over modeFor for scripts/check-page-layout.sh.
//   page-layout-modes.mjs mode-of <modes-file> <route>      prints warn|fail
//   page-layout-modes.mjs count-fail <modes-file>            reads guard output on stdin, prints how many finding lines fail: on fail routes, or ALWAYS_FAIL rules anywhere
import { readFileSync } from 'node:fs'
import { ALWAYS_FAIL, modeFor } from './page-layout-rules.mjs'

const [cmd, file, route] = process.argv.slice(2)
let text = ''
try {
  text = readFileSync(file, 'utf8')
} catch {
  /* a missing modes file means warn everywhere */
}
if (cmd === 'mode-of') {
  console.log(modeFor(text, route ?? ''))
} else if (cmd === 'count-fail') {
  const input = readFileSync(0, 'utf8')
  let n = 0
  for (const line of input.split('\n')) {
    const m = /^\s+- \d+px (\S+): (P\d+) /.exec(line)
    // ALWAYS_FAIL rules (horizontal overflow, P1 and P13) fail on every route, warn routes included.
    if (m && (ALWAYS_FAIL.includes(m[2]) || modeFor(text, m[1]) === 'fail')) n++
  }
  console.log(n)
} else {
  console.error('usage: page-layout-modes.mjs mode-of <file> <route> | count-fail <file>')
  process.exit(2)
}
