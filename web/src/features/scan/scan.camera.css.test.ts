// B9-35 (SSP-06, SSP-12, SHORT-04): scan.css for the typed entry, the camera column and the rows' scroll margin.
import { describe, expect, it } from 'vitest'
import { blocksOf, selectorList, type CssBlock } from '../../ui/lib/cssWalk.test-helper'

const blocks = blocksOf(['features/scan']).filter((b) => b.file === 'features/scan/scan.css')
const q = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ').trim()
const rule = (selector: string, atrules: string[] = []): CssBlock[] => blocks.filter((b) => selectorList(q(b.selector)).includes(q(selector)) && JSON.stringify(b.atrules) === JSON.stringify(atrules))
const val = (bs: CssBlock[], prop: string) => bs.flatMap((b) => b.decls).filter(([p]) => p === prop).map(([, v]) => v).pop()

describe('the typed entry is one row', () => {
  it('.typed-entry is a two-column grid: the field takes the room, Use its own width', () => {
    const r = rule('.typed-entry')
    expect(val(r, 'display')).toBe('grid')
    expect(val(r, 'grid-template-columns')).toBe('minmax(0, 1fr) auto')
    expect(val(r, 'gap')).toBe('var(--space-2)')
  })

  it('Use lines up with the field box, not with its label or helper (the row aligns to the end of the control)', () => {
    const use = rule('.typed-entry__use')
    expect(val(use, 'align-self')).toMatch(/^(start|end|flex-end)$/)
  })

  it('"Back to the camera" takes a row of its own', () => {
    expect(val(rule('.typed-entry__back'), 'grid-column')).toBe('1 / -1')
  })

  it('the old stacked .camera-failure block is gone (the bar replaces it)', () => {
    expect(rule('.camera-failure')).toEqual([])
  })
})

describe('the newest row scrolls clear of the bottom bar', () => {
  it('a row in the Scanned list keeps --nav-clearance below it when scrolled into view', () => {
    const r = [...rule('.scan-screen__list .list-row'), ...rule('.scan-screen .list-row'), ...rule(".scan-screen__list .list-row[data-fresh]")]
    expect(val(r, 'scroll-margin-block-end')).toBe('var(--nav-clearance)')
  })
})

describe('the camera column holds the bar and the entry in the tablet split', () => {
  it('the camera column stays a grid whose children may shrink (the 322 px column at 820)', () => {
    const r = rule('.scan-screen__camera')
    expect(val(r, 'min-width')).toBe('0')
  })

  it('tokens only: no colour literal and no raw spacing in the typed-entry rules', () => {
    for (const b of blocks.filter((x) => /typed-entry/.test(x.selector))) {
      for (const [p, v] of b.decls) {
        expect(v, `${b.selector} ${p}`).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i)
        if (/^(gap|padding|margin)/.test(p)) expect(v.replace(/var\([^)]*\)/g, ''), p).not.toMatch(/\d+(\.\d+)?(px|rem)/)
      }
    }
  })
})
