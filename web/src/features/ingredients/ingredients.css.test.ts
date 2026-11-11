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
