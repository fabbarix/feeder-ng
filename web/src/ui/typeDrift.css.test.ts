// B9-07 (DS-07 drift, docs: build/ui-review-3/B9-DRIFT-W1.md): the body role (B9-02) made every element without its own line-height
// inherit the 22 px body line and weight 500. A class that sets a font size but no line-height is therefore a geometry bug waiting to
// happen (items 8 and 9 of the drift list, `.ui-field__suffix` and `.select__value`, and every other like them in ui/ and app/), and a
// heading class with a size but no weight now reads 800 (classed h2) or 500.
// The rule, applied to EVERY rule of web/src/ui/** and web/src/app/** (not a list): a rule that sets `font-size` (other than
// `inherit`) also sets `line-height` (a --text-*-line token) or the `font` shorthand, unless another rule whose last compound is the
// same base class (`.button` for `.button[data-size='sm']`) sets one: the variant shares its element. A heading class (an `h1`-`h6`
// selector, or a class named __title, -title, __heading) that sets a size also sets `font-weight` or `font`.
import { describe, expect, it } from 'vitest'
import { blocksOf, isTokenBlock, lastCompound, selectorList, type CssBlock } from './lib/cssWalk.test-helper'

const blocks = blocksOf(['ui', 'app']).filter((b) => !isTokenBlock(b))

/** `.a[data-size='sm']:hover` -> `.a`; `h2.x` -> `h2.x`. The element class a variant or state rule styles. */
const baseOf = (compound: string) => compound.replace(/\[[^\]]*\]/g, '').replace(/:[a-z-]+(\([^)]*\))?/g, '').replace(/::[a-z-]+/g, '')

const declares = (b: CssBlock, ...props: string[]) => b.decls.some(([p]) => props.includes(p))

const sets = (b: CssBlock) => declares(b, 'font-size') && !b.decls.some(([p, v]) => p === 'font-size' && v === 'inherit')

/** base class -> the (file, base) pairs that carry a line-height (or font) / a weight (or font), over every rule of the file. */
function carriers(prop: string[]): Set<string> {
  const out = new Set<string>()
  for (const b of blocks) if (declares(b, ...prop)) for (const s of selectorList(b.selector)) out.add(`${b.file} ${baseOf(lastCompound(s))}`)
  return out
}
const withLine = carriers(['line-height', 'font'])
const withWeight = carriers(['font-weight', 'font'])

function offenders(carrier: Set<string>, prop: string[], only: (selector: string) => boolean): string[] {
  const out = new Set<string>()
  for (const b of blocks) {
    if (!sets(b)) continue
    for (const s of selectorList(b.selector)) {
      if (!only(s)) continue
      if (declares(b, ...prop)) continue
      if (carrier.has(`${b.file} ${baseOf(lastCompound(s))}`)) continue
      out.add(`${b.file}:${b.line} ${s}`)
    }
  }
  return [...out].sort()
}

const isHeadingClass = (s: string) => {
  const last = lastCompound(s)
  return /^h[1-6]\b/.test(last) || /(__title|-title|__heading|-heading)(?![a-z-])/.test(baseOf(last)) && !/subtitle/.test(last)
}

describe('type drift in ui/ and app/ (DS-07 body role)', () => {
  it('every rule that sets a font size also sets its line (or the font shorthand), here or on its base class', () => {
    expect(offenders(withLine, ['line-height', 'font'], () => true)).toEqual([])
  })

  it('every heading class that sets a font size also sets its weight, here or on its base class', () => {
    expect(offenders(withWeight, ['font-weight', 'font'], isHeadingClass)).toEqual([])
  })

  // The two items of the drift list that belong to this package, named so a failure reads as the item.
  it('drift item 8: .ui-field__suffix (and the base-unit strong in the field) carry their own line-height', () => {
    const own = blocks.filter((b) => b.file === 'ui/fields/Field.css' && selectorList(b.selector).some((s) => baseOf(lastCompound(s)) === '.ui-field__suffix'))
    expect(own.length).toBeGreaterThan(0)
    expect(own.some((b) => declares(b, 'line-height'))).toBe(true)
  })

  it('drift item 9: span.select__value carries its own line-height (a --text-*-line token)', () => {
    const own = blocks.filter((b) => b.file === 'ui/Select/Select.css' && selectorList(b.selector).includes('.select__value'))
    const line = own.flatMap((b) => b.decls).find(([p]) => p === 'line-height')?.[1] ?? ''
    expect(line).toMatch(/^var\(--text-[a-z0-9-]+-line\)$/)
  })
})
