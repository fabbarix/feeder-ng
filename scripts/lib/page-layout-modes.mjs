#!/usr/bin/env node
// CLI over modeFor for scripts/check-page-layout.sh.
//   page-layout-modes.mjs mode-of <modes-file> <route>      prints warn|fail
//   page-layout-modes.mjs count-fail <modes-file>            reads guard output on stdin, prints how many finding lines are on fail routes
import { readFileSync } from 'node:fs'
import { modeFor } from './page-layout-rules.mjs'

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
    const m = /^\s+- \d+px (\S+): /.exec(line)
    if (m && modeFor(text, m[1]) === 'fail') n++
  }
  console.log(n)
} else {
  console.error('usage: page-layout-modes.mjs mode-of <file> <route> | count-fail <file>')
  process.exit(2)
}
