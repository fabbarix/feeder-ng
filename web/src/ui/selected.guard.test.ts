// A11Y-06 guard (the chapter's "ui/ui-css.test.ts" item, kept in its own file because ui-css.test.ts is shared): no rule in web/src/ui
// whose selector marks a selected or pressed state ([aria-checked='true'], [aria-pressed='true'], [data-selected]) paints a background
// without --selected-ring in the same rule. The ring carries the state, never the fill alone.
// Exempt, with the reason: ListRow (the selected row is a row, not a control), Switch (on/off, its thumb carries it), DateField
// (a calendar day: an accent fill with on-accent text), Chip.css (B9-17 adds the selected state of the Chip with its own cue) and
// Sortable (the drag handle's pressed state, B9-13's file), and forcedColors.css (B9-55, A11Y-04: in forced colours the chosen state IS
// the Highlight fill, a system colour; no ring token exists there). A `transparent` or `none` background paints nothing, so it is not judged.
import { describe, expect, it } from 'vitest'
import { cssFiles, parseCss, readSrc } from './lib/cssWalk.test-helper'

const EXEMPT = ['ui/ListRow.css', 'ui/fields/Switch.css', 'ui/fields/DateField.css', 'ui/Chip.css', 'ui/Sortable/Sortable.css', 'ui/forcedColors.css']
const SELECTED = /\[(aria-checked|aria-pressed)='true'\]|\[data-selected(=['"]?true['"]?)?\]/

describe('selected and pressed states carry a ring', () => {
  const offenders = cssFiles('ui')
    .filter((f) => !EXEMPT.includes(f))
    .flatMap((f) => parseCss(readSrc(f), f))
    .filter((b) => b.selector.split(',').some((s) => SELECTED.test(s.trim().split(/\s+/).slice(-1)[0] ?? '') || SELECTED.test(s)))
    .filter((b) => b.decls.some(([p, v]) => (p === 'background' || p === 'background-color') && !/^(transparent|none)$/.test(v)))
    .filter((b) => !b.decls.some(([, v]) => v.includes('--selected-ring')))
    // a rule only for a disabled or hover layer is judged on its own base rule
    .filter((b) => !/:disabled|:hover|:active/.test(b.selector))

  it('every selected-state background has its ring (the list is the offenders: file, selector)', () => {
    expect(offenders.map((b) => `${b.file}: ${b.selector}`)).toEqual([])
  })

  it('the checked RadioCards card is the accent container with the ring (it set a soft fill and an accent border before)', () => {
    const blocks = parseCss(readSrc('ui/fields/RadioCards.css'), 'ui/fields/RadioCards.css').filter((b) => b.selector === ".radio-card[aria-checked='true']")
    expect(blocks.length).toBeGreaterThan(0)
    const decls = Object.fromEntries(blocks.flatMap((b) => b.decls))
    expect(decls['background']).toBe('var(--selected-bg)')
    expect(decls['box-shadow']).toContain('var(--selected-ring)')
  })

  it('the checked colour swatch and emoji keep a ring and no fill (nothing to guard)', () => {
    for (const [file, sel] of [
      ['ui/fields/ColorSwatches.css', ".colour-swatch[aria-checked='true']"],
      ['ui/fields/EmojiPicker.css', ".emoji-choice[aria-checked='true']"],
    ] as const) {
      const b = parseCss(readSrc(file), file).find((x) => x.selector === sel)
      expect(b, sel).toBeDefined()
      expect(b!.decls.some(([p]) => p === 'box-shadow')).toBe(true)
    }
  })
})
