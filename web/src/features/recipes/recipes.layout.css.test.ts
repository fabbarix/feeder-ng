// R2-1 CSS contract (jsdom does not lay out): L-02 centring, E-01 column/index/lines, E-02/E-03 Step cards, D-01 detail columns,
// D-02 hero, L-03 bars. Selectors named here are the contract of docs/dev/design/r2-1-recipes.md.
import { describe, expect, it } from 'vitest'
import { recipeRules, rulesFor, valueFor } from './rules.test-helper'

describe('L-02: no ad-hoc 760 px column, one centred editor column', () => {
  it('recipes.css has no 760px cap left', () => {
    expect(recipeRules.filter((r) => /760px/.test(r.body)).map((r) => r.selector)).toEqual([])
  })
  it('.recipe-editor is a centred 840 px column at every width', () => {
    expect(valueFor('.recipe-editor', 'max-inline-size', 0)).toBe('840px')
    expect(valueFor('.recipe-editor', 'margin-inline', 0)).toBe('auto')
    expect(valueFor('.recipe-editor', 'inline-size', 0)).toBe('100%')
  })
  it('.recipe-detail and .steps-list set no max width: the Page (1120) is the cap', () => {
    for (const sel of ['.recipe-detail', '.steps-list']) {
      for (const w of [0, 768, 1280, 1920]) expect(valueFor(sel, 'max-inline-size', w), `${sel} @${w}`).toBeUndefined()
    }
  })
})

describe('E-01: section cards and the section index', () => {
  it('the index is hidden below 1280 and sticky in the left gutter from 1280', () => {
    expect(valueFor('.recipe-editor__index', 'display', 1279)).toBe('none')
    expect(valueFor('.recipe-editor__index', 'display', 1280)).not.toBe('none')
    expect(valueFor('.recipe-editor__index', 'position', 1280)).toBe('sticky')
    expect(valueFor('.recipe-editor__index', 'inset-block-start', 1280) ?? valueFor('.recipe-editor__index', 'top', 1280)).toMatch(/var\(--space-/)
  })
  it('from 1280 the layout is [gutter | 840 column | gutter] so the index sits beside the column, which stays centred', () => {
    expect(valueFor('.recipe-editor-layout', 'display', 1280)).toBe('grid')
    expect(valueFor('.recipe-editor-layout', 'grid-template-columns', 1280)).toMatch(/minmax\(0, 1fr\) minmax\(0, 840px\) minmax\(0, 1fr\)/)
    expect(valueFor('.recipe-editor-layout', 'grid-template-columns', 1279)).toBeUndefined()
  })
  it('the index links are not hover-only: current section marked by aria-current, with a visible style', () => {
    const current = rulesFor(".recipe-editor__index a[aria-current='true']")
    expect(current.length).toBeGreaterThan(0)
  })
  it('anchored sections leave room for the sticky bar (scroll-margin-block)', () => {
    expect(valueFor('.recipe-editor__section', 'scroll-margin-block-start', 0)).toMatch(/var\(--space-/)
  })
  it('the editor footer is no longer the bar: .recipe-editor__footer is gone', () => {
    expect(rulesFor('.recipe-editor__footer')).toEqual([])
  })
})

// B9-37 (RX-02; rewritten from the B9-10 49rem contract): the lines box is the container "rx-lines" and a line is one row from 42rem of its
// width (672 px; a 720 px viewport) under visible captions, with the chapter's tracks: handle 32 · Ingredient minmax(9rem, 1.6fr) ·
// Quantity 88 · Unit 112 · Note minmax(6rem, 1fr) · Optional 64 · the ⋮ and trash 88. The drag handle sits inside the Ingredient cell,
// which spans the handle and Ingredient tracks. Optional is a checkbox cell of its own (RX-10). Below 42rem a line is two rows on a phone,
// the Note a third row only when the line has one. recipe-editor.flow.css.test.ts pins the tracks and the caption alignment too.
describe('E-01: an ingredient line is one row from 42rem (672 px) of its lines box', () => {
  const FROM = 672
  it('below 42rem the line uses the multi-row layout and no captions', () => {
    for (const w of [0, 375, 671]) {
      expect(valueFor('.line-row', 'grid-template-areas', w), `@${w}`).toMatch(/ingredient ingredient/)
      expect(valueFor('.recipe-editor__lines-head', 'display', w), `@${w}`).toBe('none')
    }
  })
  it('has a header row of captions from 42rem', () => {
    expect(valueFor('.recipe-editor__lines-head', 'display', FROM)).toBe('grid')
  })
  it('.line-row: every cell on row 1, the hint on row 2, the Ingredient cell over the handle and Ingredient tracks', () => {
    for (const c of ['quantity', 'unit', 'note', 'optional', 'remove']) expect(valueFor(`.line-row__${c}`, 'grid-row', FROM), c).toBe('1')
    expect(valueFor('.line-row__ingredient', 'grid-row', FROM)).toBe('1')
    expect(valueFor('.line-row__ingredient', 'grid-column', FROM)).toBe('1 / span 2')
    expect(valueFor('.line-row__hint', 'grid-row', FROM)).toBe('2')
  })
  it('the actions track holds two 40 px icon buttons and a gap', () => {
    const last = Number(/ (\d+)px$/.exec(valueFor('.line-row', 'grid-template-columns', FROM)!)![1])
    expect(last).toBeGreaterThanOrEqual(88)
  })
  it('the cells are centred on the row from 42rem (one row of 48 px fields)', () => {
    expect(valueFor('.line-row', 'align-items', FROM)).toBe('center')
  })
  it('the Ingredient picker keeps a 180 px basis inside its cell', () => {
    expect(valueFor('.line-row__ingredient-body', 'flex-wrap', 0)).toBe('wrap')
    expect(valueFor('.line-row__ingredient-body > :first-child', 'flex', 0)).toMatch(/^1 1 180px$/)
  })
  it('the header uses the same columns so the captions sit over the fields', () => {
    expect(valueFor('.recipe-editor__lines-head', 'grid-template-columns', FROM)).toBe(valueFor('.line-row', 'grid-template-columns', FROM))
  })
  it('the last track is a fixed width: an `auto` track is empty in the header and would collapse, drifting the captions', () => {
    for (const sel of ['.recipe-editor__lines-head', '.line-row']) {
      for (const w of [672, 1280, 1920]) {
        const cols = valueFor(sel, 'grid-template-columns', w)!
        expect(cols, `${sel} @${w}`).not.toMatch(/\bauto\b/)
        expect(cols, `${sel} @${w}`).toMatch(/ \d+px$/)
      }
    }
  })
  it('the header and the row pad and space alike (same gap, same inline padding)', () => {
    expect(valueFor('.recipe-editor__lines-head', 'column-gap', FROM)).toBe(valueFor('.line-row', 'column-gap', FROM))
    expect(valueFor('.recipe-editor__lines-head', 'padding-inline', FROM)).toBe(valueFor('.line-row', 'padding-inline', FROM))
  })
  it('the cells are direct grid items; from 42rem they leave the named areas', () => {
    expect(valueFor('.line-row', 'grid-template-areas', FROM)).toBe('none')
    for (const c of ['quantity', 'unit', 'note', 'optional', 'remove']) expect(valueFor(`.line-row__${c}`, 'grid-area', FROM), c).toBe('auto')
    for (const sel of ['.line-row__amount', '.line-row__extras']) expect(rulesFor(sel), sel).toEqual([])
  })
  it('from 42rem the field labels in a row and the Optional label are visually hidden (kept for assistive tech); the header names the columns', () => {
    const body = [...rulesFor('.line-row .ui-field__label'), ...rulesFor('.line-row__optional .checkbox__label')].filter((r) => r.minWidth === FROM)
    expect(body.length).toBe(2)
    expect(body.map((r) => r.body).join(' ')).toMatch(/clip-path:\s*inset\(50%\)/)
    expect(body.map((r) => r.body).join(' ')).toMatch(/position:\s*absolute/)
  })
  it('a row has no card background of its own (it is a hairline-separated line); the Note and the trash show from 42rem', () => {
    expect(valueFor('.line-row', 'background', FROM)).toBeUndefined()
    expect(valueFor('.line-row', 'border-block-end', 0)).toMatch(/var\(--color-line\)/)
    expect(valueFor(".line-row[data-has-note='false'] .line-row__note", 'display', FROM)).toBe('block')
    expect(valueFor('.line-row__trash', 'display', FROM)).toBe('inline-flex')
  })
})

describe('E-01: an ingredient line is two rows on a phone (below 42rem)', () => {
  const rows = (w: number) => [...(valueFor('.line-row', 'grid-template-areas', w) ?? '').matchAll(/["']([^"']+)["']/g)].map((m) => m[1]!.trim().split(/\s+/))
  it('row 1 is the Ingredient (with the handle inside) and the ⋮', () => {
    expect(new Set(rows(0)[0])).toEqual(new Set(['ingredient', 'remove']))
  })
  it('Quantity, Unit and the Optional checkbox share the second row', () => {
    expect(new Set(rows(0)[1])).toEqual(new Set(['quantity', 'unit', 'optional']))
  })
  it('the Note follows on its own full row, shown only when the line has one; the trash is hidden (Remove is in the ⋮)', () => {
    const r = rows(0)
    expect(r).toHaveLength(3)
    expect(new Set(r[2])).toEqual(new Set(['note']))
    expect(valueFor(".line-row[data-has-note='false'] .line-row__note", 'display', 0)).toBe('none')
    expect(valueFor('.line-row__trash', 'display', 0)).toBe('none')
  })
  it('every cell is placed in its area; the hint takes its own row after them', () => {
    for (const c of ['ingredient', 'quantity', 'unit', 'note', 'optional', 'remove']) {
      expect(valueFor(`.line-row__${c}`, 'grid-area', 0), c).toBe(c)
    }
    expect(valueFor('.line-row__hint', 'grid-column', 0)).toBe('1 / -1')
    expect(valueFor('.line-row__hint', 'grid-row', 0)).toBe('4')
  })
  it('the tracks are the handle, a short track for Quantity, the flexible Unit and the actions', () => {
    expect(valueFor('.line-row', 'grid-template-columns', 0)).toMatch(/^32px \d+px minmax\(0, 1fr\) auto$/)
  })
  it('the actions cell is end-aligned and centred on its row', () => {
    expect(valueFor('.line-row__remove', 'justify-self', 0)).toBe('end')
    expect(valueFor('.line-row__remove', 'align-self', 0)).toBe('center')
  })
})

describe('E-02 / E-03: Step cards', () => {
  it('a Step card sits at the same depth as a line: no extra inline padding or indent', () => {
    expect(valueFor('.step-card', 'margin-inline-start', 1280)).toBeUndefined()
    expect(valueFor('.steps-editor__list', 'padding-inline-start', 0)).toBe('0')
    expect(valueFor('.steps-editor__list', 'margin', 0)).toBe('0')
    expect(valueFor('.steps-editor__list', 'list-style', 0)).toBe('none')
  })
  it('the Kind and Duration row wraps and lines the controls up at their foot', () => {
    expect(valueFor('.step-card__timing', 'align-items', 0)).toBe('flex-end')
  })
  it('the Segmented frame in the timing row has an intrinsic width, so Kind and Duration share a row (it was 100 % wide, so Duration always wrapped)', () => {
    const sel = '.step-card__timing > .ui-field:has(.segmented)'
    for (const w of [0, 390, 600, 1280]) {
      const v = valueFor(sel, 'inline-size', w)
      expect(v, `@${w}`).toMatch(/^(auto|max-content|fit-content)/)
    }
  })
  it('the Step kind options stay on one line (P30): the control never shrinks below its content, and the row wraps Duration instead', () => {
    const sel = '.step-card__timing > .ui-field:has(.segmented)'
    for (const w of [0, 375, 390, 834, 1440]) {
      expect(valueFor(sel, 'flex', w), `@${w}`).toBe('none')
      expect(valueFor(sel, 'min-inline-size', w), `@${w}`).toBe('max-content')
      expect(valueFor(sel, 'max-inline-size', w), `@${w}`).toBeUndefined()
    }
  })
  // B9-37 (RX-02): the uses, "Ingredient use" and "Photo" are one wrapping chip row; the card is a lead column, the body and the actions.
  it('the chip row is a wrapping row of chips', () => {
    expect(valueFor('.step-card__more', 'display', 0)).toBe('flex')
    expect(valueFor('.step-card__more', 'flex-wrap', 0)).toBe('wrap')
  })
  it('a card is lead | body on a phone (the ⋮ under the lead), and lead | body | actions on one row from 42rem', () => {
    expect(valueFor('.step-card', 'grid-template-columns', 0)).toBe('44px minmax(0, 1fr)')
    expect(valueFor('.step-card', 'grid-template-areas', 0)).toMatch(/'lead body' 'actions body'/)
    expect(valueFor('.step-card', 'grid-template-areas', 672)).toBe("'lead body actions'")
    expect(valueFor('.step-card__remove', 'display', 0)).toBe('none')
    expect(valueFor('.step-card__remove', 'display', 672)).toBe('inline-flex')
  })
})

// B9-37 (RX-09, decision RX 6): the Tag field is removable chips plus "Add Tag" (the inline text field and its suggestions are gone).
describe('E-01: Tags as removable chips plus "Add Tag"', () => {
  it('the chips and the Add Tag button share one wrapping row that may shrink (DS-04: no fixed width)', () => {
    expect(valueFor('.tag-chooser__chips', 'display', 0)).toBe('flex')
    expect(valueFor('.tag-chooser__chips', 'flex-wrap', 0)).toBe('wrap')
    expect(valueFor('.tag-chooser__chips', 'gap', 0)).toBe('var(--space-2)')
    expect(valueFor('.tag-chooser', 'grid-template-columns', 0)).toBe('minmax(0, 1fr)')
  })
  it('the old inline-field rules are gone', () => {
    for (const sel of ['.tag-input', '.tag-input__control', '.tag-input__label', '.tag-input__tags', '.tag-input__suggestions']) expect(rulesFor(sel), sel).toEqual([])
  })
})

describe('D-01: Recipe detail at 1280 and up', () => {
  it('is one column below 1280', () => {
    expect(valueFor('.recipe-detail__layout', 'grid-template-columns', 1279)).toBeUndefined()
    expect(valueFor('.recipe-detail__layout', 'display', 1279)).not.toBe('grid')
  })
  it('is two columns from 1280: a 360 px left column and the Steps on the right', () => {
    expect(valueFor('.recipe-detail__layout', 'display', 1280)).toBe('grid')
    expect(valueFor('.recipe-detail__layout', 'grid-template-columns', 1280)).toBe('360px minmax(0, 1fr)')
    expect(valueFor('.recipe-detail__layout', 'align-items', 1280)).toBe('start')
  })
  it('the left column is sticky from 1280', () => {
    expect(valueFor('.recipe-detail__aside', 'position', 1280)).toBe('sticky')
    expect(valueFor('.recipe-detail__aside', 'position', 1279)).toBeUndefined()
  })
  it('both columns are flex columns with the screen gap', () => {
    for (const sel of ['.recipe-detail__aside', '.recipe-detail__main']) {
      expect(valueFor(sel, 'display', 0), sel).toBe('flex')
      expect(valueFor(sel, 'flex-direction', 0), sel).toBe('column')
      expect(valueFor(sel, 'gap', 0), sel).toBe('var(--space-4)')
    }
  })
})

describe('D-02: hero photo', () => {
  it('is 16:9 below 1280 with no 170 px strip, and fills the 360 px left column from 1280', () => {
    expect(valueFor('.recipe-detail__hero .tile__media', 'aspect-ratio', 0)).toBe('16 / 9')
    expect(valueFor('.recipe-detail__hero .tile__media', 'max-block-size', 0)).toBeUndefined()
    expect(recipeRules.filter((r) => /170px/.test(r.body)).map((r) => r.selector)).toEqual([])
  })
  it('below 1280 the hero is capped at 820 px wide and centred (a phone is full width)', () => {
    expect(valueFor('.recipe-detail__hero', 'max-inline-size', 0)).toBe('820px')
    expect(valueFor('.recipe-detail__hero', 'margin-inline', 0)).toBe('auto')
    expect(valueFor('.recipe-detail__hero', 'max-inline-size', 1280)).toBe('none')
  })
})

describe('L-03: the bars are StickyActionBars, not their own sticky strips', () => {
  it('.cook-entry is not sticky, has no fixed bottom, no surface of its own and no shadow', () => {
    for (const w of [0, 720, 1280]) {
      expect(valueFor('.cook-entry', 'position', w)).toBeUndefined()
      expect(valueFor('.cook-entry', 'bottom', w)).toBeUndefined()
      expect(valueFor('.cook-entry', 'box-shadow', w)).toBeUndefined()
      expect(valueFor('.cook-entry', 'background', w)).toBeUndefined()
    }
  })
  it('inline in the left column (>= 1280) the Cook entry is a plain stack: Batches stepper, hint, then a full-width button', () => {
    expect(valueFor('.cook-entry', 'flex-direction', 1280)).toBe('column')
  })
})
