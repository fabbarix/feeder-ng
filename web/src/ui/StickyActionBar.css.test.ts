// B9-19 (SHORT-04, SHORT-08): the sticky action bar is one row, --bar-gap above what is below it, as wide as its column, and floats only
// while it has something to do. Reads ui/StickyActionBar.css.
import { describe, expect, it } from 'vitest'
import { parseCss } from './lib/cssWalk.test-helper'
import { readUiCss } from './test-utils'

const blocks = parseCss(readUiCss('StickyActionBar.css'), 'ui/StickyActionBar.css')
/** The merged declarations of the blocks with this selector under exactly these at-rule conditions ([] = top level). */
function at(selector: string, conds: string[] = []): Record<string, string> {
  const want = [...conds].sort().join('|')
  const out: Record<string, string> = {}
  for (const b of blocks) {
    const have = b.atrules
      .flatMap((a) => a.replace(/^@media\s*/, '').split(/\s+and\s+/))
      .map((c) => c.trim())
      .sort()
      .join('|')
    if (have !== want || !b.selector.split(',').map((s) => s.trim().replace(/"/g, "'")).includes(selector)) continue
    for (const [k, v] of b.decls) out[k] = v
  }
  return out
}

describe('StickyActionBar.css, the column (SHORT-08)', () => {
  it("data-column='form' caps the box at 840 px, centred like the column", () => {
    const d = at(".sticky-action-bar[data-column='form']")
    expect(d['max-inline-size']).toBe('840px')
    expect(d['margin-inline']).toBe('auto')
  })

  it("data-column='narrow' caps the box at --page-narrow (720 px), centred", () => {
    const d = at(".sticky-action-bar[data-column='narrow']")
    expect(d['max-inline-size']).toBe('var(--page-narrow)')
    expect(d['margin-inline']).toBe('auto')
  })

  it("the page column ('page', the default) has no cap: the bar is as wide as the Page content", () => {
    expect(at(".sticky-action-bar[data-column='page']")['max-inline-size']).toBeUndefined()
    expect(at('.sticky-action-bar')['max-inline-size']).toBeUndefined()
  })

  it('the inner row has no cap of its own any more', () => {
    for (const b of blocks.filter((x) => /sticky-action-bar__inner/.test(x.selector))) {
      expect(b.decls.map(([p]) => p), b.selector).not.toContain('max-inline-size')
    }
  })
})

describe('StickyActionBar.css, the gap, the height and the clearance (SHORT-04)', () => {
  it('one gap at every size: --bar-gap above the bottom bar, the viewport edge or the keyboard; no rule from 1024 re-states it', () => {
    expect(at('.sticky-action-bar')['bottom']).toBe('calc(var(--nav-top) + var(--bar-gap) + var(--keyboard-inset))')
    expect(blocks.some((b) => b.atrules.some((a) => /min-width/.test(a)) && /sticky-action-bar/.test(b.selector))).toBe(false)
  })

  it('is 70 px tall: 12 px of padding above and below a 44 px row and the hairlines; 62 px (8 px of padding) under 500 px tall', () => {
    expect(at('.sticky-action-bar')['padding-block']).toBe('var(--space-3)')
    expect(at('.sticky-action-bar', ['(max-height: 499px)'])['padding-block']).toBe('var(--space-2)')
  })

  it('the clearance default is the one-row bar: 70 px, and 62 px on a short viewport', () => {
    expect(at(':root')['--sticky-bar-clearance']).toBe('70px')
    expect(at(':root', ['(max-height: 499px)'])['--sticky-bar-clearance']).toBe('62px')
  })

  it('the end of the page keeps the same gap the bar floats at, so it never jumps at the end of the scroll', () => {
    const d = at('.app-main:has(.sticky-action-bar):not(.app-main--full)')
    expect(d['padding-bottom']).toBe('calc(var(--nav-top) + var(--bar-gap))')
  })
})

describe('StickyActionBar.css, floating only while it has something to do (SHORT-04, SHORT-06)', () => {
  it("sticky={false} (data-sticky='false') ends the form: position static", () => {
    expect(at(".sticky-action-bar[data-sticky='false']")['position']).toBe('static')
  })

  it('under 340 px tall the bar ends the form too (nothing is fixed over the page at 400 % zoom)', () => {
    expect(at('.sticky-action-bar', ['(max-height: 339px)'])['position']).toBe('static')
  })

  it('a static bar keeps its card look: no rule drops the background, border or radius', () => {
    for (const b of blocks.filter((x) => x.atrules.length > 0 || /data-sticky/.test(x.selector))) {
      if (!/sticky-action-bar/.test(b.selector)) continue
      expect(b.decls.map(([p]) => p).filter((p) => /background|border|box-shadow/.test(p)), b.selector).toEqual([])
    }
  })
})
