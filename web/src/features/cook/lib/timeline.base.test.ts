// BR-H: toCookStep carries the Base recipe label to the Step tile.
import { describe, expect, it } from 'vitest'
import { BECHAMEL, LAYER, SIMMER, baseTimeline } from '../base-fixtures'
import { toCookStep, visibleItems } from './timeline'

describe('toCookStep and the Base recipe', () => {
  it('copies the label of a Base recipe Step', () => {
    const shown = visibleItems(baseTimeline(), 'all')
    expect(toCookStep(shown[1]!).baseRecipe).toEqual(BECHAMEL)
    expect(toCookStep({ item: SIMMER, number: 1, of: 1 }).baseRecipe).toEqual({ id: 31, name: 'Béchamel', path: ['Béchamel'] })
  })
  it('is null for the Recipe\'s own Step, and for a payload without the field', () => {
    expect(toCookStep({ item: LAYER, number: 1, of: 1 }).baseRecipe).toBeNull()
    const { baseRecipe: _omit, ...old } = LAYER
    expect(toCookStep({ item: old as typeof LAYER, number: 1, of: 1 }).baseRecipe).toBeNull()
  })
  it('numbers only the Steps shown: a covered block leaves "Step 1 of 2", and the index stays the composed one', () => {
    const shown = visibleItems({ ...baseTimeline(), items: [{ ...LAYER, number: 1 }] }, 'all')
    const step = toCookStep(shown[0]!)
    expect([step.number, step.of, step.index]).toEqual([1, 1, 2])
  })
})
