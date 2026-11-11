// CSS contract of the New Ingredient sheet (jsdom does not lay out): ui-review-2 F-09 "labelled sections with spacing tokens".
import { describe, expect, it } from 'vitest'
import { readSource } from '../plan/test-css'

const css = readSource('features/ingredients/ingredients.css').replace(/\/\*[\s\S]*?\*\//g, '')

/** The rule bodies whose selector mentions `part`. */
const bodies = (part: string) =>
  [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, selector]) => selector!.includes(part)).map(([, , body]) => body!)

describe('ingredients.css, New Ingredient sheet', () => {
  it('is readable', () => {
    expect(css).toContain('.new-ingredient')
  })
  it('stacks the sections with the spacing token, no loose pixel gap', () => {
    const form = bodies('.new-ingredient__form').join(' ')
    expect(form).toMatch(/display:\s*(flex|grid)/)
    expect(form).toMatch(/gap:\s*var\(--space-5\)/)
  })
  it('keeps no hand-written pixel spacing in the sheet rules', () => {
    for (const body of bodies('.new-ingredient')) expect(body).not.toMatch(/(gap|margin[a-z-]*|padding[a-z-]*):\s*[^;]*\d+px/)
  })
  it('drops the old flush chip row (Base Unit is a Segmented now)', () => {
    expect(css).not.toContain('.new-ingredient__units')
  })
})

// R2-3 (F-05): the Base Unit picker is now shared by the New Ingredient sheet and the Ingredient screen, so its rules carry its
// own name (.base-unit__*), not the sheet's. The visual contract is unchanged (three equal options, 48 px, the checked one filled).
describe('ingredients.css, shared Base Unit picker (R2-3)', () => {
  it('names the picker rules .base-unit__*, no longer .new-ingredient__unit/options/label/section (the sheet keeps its own __helper)', () => {
    for (const part of ['.base-unit', '.base-unit__options', '.base-unit__option', '.base-unit__label', '.base-unit__helper']) expect(css).toContain(part)
    for (const old of ['.new-ingredient__unit', '.new-ingredient__options', '.new-ingredient__label', '.new-ingredient__section']) {
      expect(css).not.toContain(old)
    }
  })
  it('keeps three equal columns and 48 px options', () => {
    expect(bodies('.base-unit__options').join(' ')).toMatch(/grid-template-columns:\s*repeat\(3,\s*1fr\)/)
    expect(bodies('.base-unit__option').join(' ')).toMatch(/min-block-size:\s*48px/)
  })
  it('fills the checked option, and has a read-only value row for a locked Base Unit', () => {
    expect(css).toMatch(/\.base-unit__option\[aria-checked='true'\]/)
    expect(css).toContain('.base-unit__value')
  })
  it('uses spacing tokens only in the picker rules', () => {
    for (const body of bodies('.base-unit')) expect(body).not.toMatch(/(gap|margin[a-z-]*|padding[a-z-]*):\s*[^;]*\d+px/)
  })
})

