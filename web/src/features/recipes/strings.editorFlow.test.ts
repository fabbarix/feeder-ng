// B9-37 (RX-02, RX-10): the editor-flow strings. Sections, kind, the Tag chooser and the Household's defaults footnote.
import { describe, expect, it } from 'vitest'
import { recipeStrings } from './strings'

describe('recipeStrings.fields (B9-37)', () => {
  it('kind and its help', () => {
    expect(recipeStrings.fields.kind).toBe('Kind')
    expect(recipeStrings.fields.kindHelp).toBe('A Ready Meal is one bought pack. A Base recipe is used inside other Recipes and never planned.')
  })

  it('householdDefaults names the Household\'s three values and the Reheat time rule, as one footnote', () => {
    expect(recipeStrings.fields.householdDefaults(7, 2, 90)).toBe(
      "Leave a field blank to use the Household's setting: Cool-down 7 days, Leftover Use-by 2 days, Frozen Use-by 90 days. Reheat time without a value is worked out from the portions.",
    )
  })

  it('householdDefaults says "1 day" for one', () => {
    expect(recipeStrings.fields.householdDefaults(1, 1, 1)).toContain('Cool-down 1 day, Leftover Use-by 1 day, Frozen Use-by 1 day.')
  })
})
