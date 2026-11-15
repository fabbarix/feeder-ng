// B9-35 (SHORT-04 "Scan in landscape", R-A): Mute, the torch and Type a barcode sit on the strip's tinted surface (--color-surface-2), so
// each takes the R-A surface: a --color-surface fill and a 1 px --color-outline boundary (3:1 or more), not a surface-2 fill on surface-2.
import { describe, expect, it } from 'vitest'
import { blocksOf, selectorList, type CssBlock } from './lib/cssWalk.test-helper'

const q = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ').trim()
const blocks = blocksOf(['ui']).filter((b) => b.file === 'ui/ViewfinderStrip.css')
const rule = (selector: string): CssBlock[] => blocks.filter((b) => selectorList(q(b.selector)).includes(q(selector)))
const val = (bs: CssBlock[], prop: string) => bs.flatMap((b) => b.decls).filter(([p]) => p === prop).map(([, v]) => v).pop()

describe('the strip\'s control buttons take the R-A surface', () => {
  const r = rule('.viewfinder-strip__controls .icon-button')
  it('a --color-surface fill', () => expect(val(r, 'background')).toBe('var(--color-surface)'))
  it('a 1 px --color-outline boundary', () => expect(val(r, 'box-shadow')).toBe('inset 0 0 0 1px var(--color-outline)'))
})
