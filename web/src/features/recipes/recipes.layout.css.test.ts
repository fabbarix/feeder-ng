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

describe('E-01: an ingredient line is one row from 720 px', () => {
  it('has a header row of captions from 720 px, hidden below', () => {
    expect(valueFor('.recipe-editor__lines-head', 'display', 719)).toBe('none')
    expect(valueFor('.recipe-editor__lines-head', 'display', 720)).toBe('grid')
  })
  it('.line-row: Ingredient 1fr · Quantity 88 · Unit 120 · Note 1fr · Optional · remove, on one grid row', () => {
    const cols = valueFor('.line-row', 'grid-template-columns', 720)
    expect(cols).toMatch(/^minmax\(0, 1fr\) 88px 120px minmax\(0, 1fr\) auto auto$/)
    expect(valueFor('.line-row', 'grid-template-columns', 719)).not.toMatch(/88px/)
  })
  it('the header uses the same columns so the captions sit over the fields', () => {
    expect(valueFor('.recipe-editor__lines-head', 'grid-template-columns', 720)).toBe(valueFor('.line-row', 'grid-template-columns', 720))
  })
  it('the wrappers dissolve into the row (display: contents) and the Ingredient is no longer a full-width row', () => {
    for (const sel of ['.line-row__amount', '.line-row__extras']) expect(valueFor(sel, 'display', 720), sel).toBe('contents')
    expect(valueFor('.line-row__ingredient', 'grid-column', 720)).toBe('auto')
    expect(valueFor('.line-row__ingredient', 'grid-column', 719)).toBe('1 / -1')
  })
  it('from 720 the field labels in a row are visually hidden (kept for assistive tech); the header names the columns', () => {
    const body = rulesFor('.line-row .ui-field__label').filter((r) => r.minWidth === 720)
    expect(body.length).toBeGreaterThan(0)
    expect(body.map((r) => r.body).join(' ')).toMatch(/clip-path:\s*inset\(50%\)/)
    expect(body.map((r) => r.body).join(' ')).toMatch(/position:\s*absolute/)
  })
  it('a row has no card background of its own from 720 (it is a hairline-separated line)', () => {
    expect(valueFor('.line-row', 'background', 720)).toBe('none')
    expect(valueFor('.line-row', 'border-block-end', 720)).toMatch(/var\(--color-line\)/)
  })
})

describe('E-02 / E-03: Step cards', () => {
  it('a Step card sits at the same depth as a line: no extra inline padding or indent', () => {
    expect(valueFor('.step-card', 'margin-inline-start', 1280)).toBeUndefined()
    expect(valueFor('.steps-editor__list', 'padding-inline-start', 0)).toBe('0')
    expect(valueFor('.steps-editor__list', 'margin', 0)).toBe('0')
    expect(valueFor('.steps-editor__list', 'list-style', 0)).toBe('none')
  })
  it('the Kind and Duration row is a FieldRow inside the card (wrap, centre aligned to the controls)', () => {
    expect(valueFor('.step-card__timing', 'align-items', 0)).toBe('flex-end')
  })
  it('the "Uses" strip is a wrapping row of chips, shown only when there are uses or the + Use chip', () => {
    expect(valueFor('.step-card__uses', 'display', 0)).toBe('flex')
    expect(valueFor('.step-card__uses', 'flex-wrap', 0)).toBe('wrap')
  })
  it('the Step head carries number, text area and the actions on one row from 720', () => {
    expect(valueFor('.step-card__head', 'display', 0)).toBe('flex')
    expect(valueFor('.step-card__head', 'align-items', 0)).toBe('flex-start')
  })
})

describe('E-01: Tags as a chip input', () => {
  it('chips and the text field share one flex-wrap control capped at the md size (320 px)', () => {
    expect(valueFor('.tag-input__control', 'display', 0)).toBe('flex')
    expect(valueFor('.tag-input__control', 'flex-wrap', 0)).toBe('wrap')
    expect(valueFor('.tag-input', 'max-inline-size', 0)).toBe('320px')
  })
  it('the old stacked chip list (a block under the chips) is gone', () => {
    expect(rulesFor('.tag-input__tags')).toEqual([])
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
