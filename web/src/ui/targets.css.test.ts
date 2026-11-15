// A11Y-09: on a coarse pointer every control has a hit area of at least --target-min (44 px) both ways, drawn by its own ::after
// (negative inset), never by growing the visual. This file pins the controls B9-16 owns that draw under 44 px: Switch, colour
// swatch, Segmented option (in Segmented.selected.test.tsx), the stepper field's buttons, the IconButton. Chip is B9-17's, the
// Your menu button B9-19's. Real layout is P36 (scripts/lib/page-layout/rules/P36-targets.mjs).
import { describe, expect, it } from 'vitest'
import { cssFiles, parseCss, readSrc, type CssBlock } from './lib/cssWalk.test-helper'

const coarse = (file: string): CssBlock[] => parseCss(readSrc(file), file).filter((b) => b.atrules.some((a) => /\(pointer:\s*coarse\)/.test(a)))
const decl = (blocks: CssBlock[], selector: string) => Object.fromEntries(blocks.filter((b) => b.selector.split(',').map((s) => s.trim()).includes(selector)).flatMap((b) => b.decls))

describe('Switch (52 x 32 drawn)', () => {
  const blocks = coarse('ui/fields/Switch.css')
  it('draws a 52 x 44 hit area with ::after on a coarse pointer', () => {
    const d = decl(blocks, '.switch::after')
    expect(d['content']).toBe("''")
    expect(d['position']).toBe('absolute')
    expect(d['inset']).toBe('-6px 0')
  })
})

describe('Colour swatch (40 px drawn)', () => {
  const blocks = coarse('ui/fields/ColorSwatches.css')
  it('draws a 44 px hit area with ::after on a coarse pointer', () => {
    expect(decl(blocks, '.colour-swatch')['position']).toBe('relative')
    const d = decl(blocks, '.colour-swatch::after')
    expect(d['content']).toBe("''")
    expect(d['position']).toBe('absolute')
    expect(d['inset']).toBe('-2px')
  })
})

describe('the fine-pointer rules do not carry the coarse hit areas', () => {
  it('the hit area is declared only inside the coarse query (a mouse needs no bigger target)', () => {
    for (const [file, sel] of [
      ['ui/fields/Switch.css', '.switch::after'],
      ['ui/fields/ColorSwatches.css', '.colour-swatch::after'],
    ] as const) {
      const outside = parseCss(readSrc(file), file).filter((b) => b.selector === sel && !b.atrules.some((a) => /pointer:\s*coarse/.test(a)))
      expect(outside, `${file} ${sel}`).toEqual([])
    }
  })
})

describe('every ui control class under 44 px declares a coarse ::after (the guard the chapter asks of ui-css.test.ts)', () => {
  // [file, selector of the control, drawn height in px]: the controls B9-16 owns.
  const SMALL: [string, string][] = [
    ['ui/fields/Switch.css', '.switch'],
    ['ui/fields/ColorSwatches.css', '.colour-swatch'],
    ['ui/fields/Segmented.css', '.segmented__option'],
  ]
  it.each(SMALL)('%s %s', (file, selector) => {
    const after = coarse(file).filter((b) => b.selector.split(',').map((s) => s.trim()).includes(`${selector}::after`))
    expect(after.length, `${selector}::after in a (pointer: coarse) block`).toBeGreaterThan(0)
  })

  it('the stylesheets of the ui folder have a coarse block only for a control (no layout change on a coarse pointer)', () => {
    const files = cssFiles('ui/fields').filter((f) => coarse(f).length > 0)
    expect(files.sort()).toEqual(['ui/fields/ColorSwatches.css', 'ui/fields/Segmented.css', 'ui/fields/Switch.css'])
  })
})
