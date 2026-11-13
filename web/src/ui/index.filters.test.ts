// hf-recipes-filter: the ui barrel exports the new shared primitives (docs/design/recipes-filter.md 7).
import { describe, expect, it } from 'vitest'
import * as ui from './index'

describe('ui barrel: filter header primitives', () => {
  // pantry-filter: the filter header shared by Recipes and the Pantry (docs/design/pantry-filter.md 5).
  it.each(['Popover', 'OptionList', 'ActiveFilterChips', 'FiltersButton', 'FiltersPanel', 'FilterSection', 'FilterChipGroup', 'useFittingChips', 'measureChipLine'])('exports %s', (name) => {
    expect(typeof (ui as Record<string, unknown>)[name]).toBe('function')
  })
})
