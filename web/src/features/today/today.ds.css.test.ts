// DS-A round 2: Today's three columns from 1280 px must not depend on stylesheet load order. `.today .bento-grid` (0,2,0) ties
// with `.bento-grid[data-min='card']` (0,2,0); with the attribute back, `.today .bento-grid[data-min]` (0,3,0) wins wherever it loads.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/today/today.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('today.css, the 1280 px grid', () => {
  const wide = css.slice(css.indexOf('@media (min-width: 1280px)'))
  it('targets .today .bento-grid[data-min] (an attribute selector, specificity 0,3,0)', () => {
    expect(wide).toMatch(/\.today \.bento-grid\[data-min\]\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/)
  })
  it('has no bare `.today .bento-grid {` rule that ties with BentoGrid', () => {
    expect(css).not.toMatch(/\.today \.bento-grid\s*\{/)
  })
})
