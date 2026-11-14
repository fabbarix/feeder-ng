// The CSS walk helper itself (B9-07 test infrastructure): blocks, at-rule context, keyframes skipped, ; inside url().
import { describe, expect, it } from 'vitest'
import { blocksOf, isTokenBlock, lastCompound, parseCss, selectorList } from './cssWalk.test-helper'

const css = `/* c */
:root { --a: 1px; }
.a, .b:is(.c, .d) { color: red; background: url("x;y.png"); }
@media (min-width: 48em) {
  .a { padding: 2px; }
  @container card (width < 34rem) { .e { gap: 3px } }
}
@keyframes spin { from { opacity: 0 } to { opacity: 1 } }
`

describe('parseCss', () => {
  const blocks = parseCss(css, 'x.css')
  it('flattens rules with their at-rule context and line', () => {
    expect(blocks.map((b) => [b.selector, b.atrules, b.line])).toEqual([
      [':root', [], 2],
      ['.a, .b:is(.c, .d)', [], 3],
      ['.a', ['@media (min-width: 48em)'], 5],
      ['.e', ['@media (min-width: 48em)', '@container card (width < 34rem)'], 6],
    ])
  })
  it('keeps a ; inside url() in its value and skips @keyframes steps', () => {
    expect(blocks[1]!.decls).toEqual([['color', 'red'], ['background', 'url("x;y.png")']])
  })
  it('splits selector lists at top-level commas, reads the last compound, knows token blocks', () => {
    expect(selectorList('.a, .b:is(.c, .d)')).toEqual(['.a', '.b:is(.c, .d)'])
    expect(lastCompound('.tile > .x__icon')).toBe('.x__icon')
    expect(isTokenBlock(blocks[0]!)).toBe(true)
    expect(isTokenBlock(blocks[1]!)).toBe(false)
  })
  it('reads the real ui and app stylesheets', () => {
    expect(blocksOf(['ui', 'app']).length).toBeGreaterThan(500)
  })
})
