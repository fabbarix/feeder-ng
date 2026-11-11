// Units shown beside NumberFields are copy: they live in recipeStrings, not in the components.
import { describe, expect, it } from 'vitest'
import { recipeStrings } from './strings'

const raw = import.meta.glob<string>(['./components/RecipeDetailsFields.tsx', './components/StepsEditor.tsx'], { query: '?raw', import: 'default', eager: true })

describe('Recipes unit suffixes', () => {
  it('recipeStrings holds the day and minute units', () => {
    expect(recipeStrings.units).toEqual({ days: 'days', min: 'min' })
  })
  it('the components have no literal unit="..."', () => {
    expect(Object.keys(raw)).toHaveLength(2)
    for (const src of Object.values(raw)) expect(src).not.toMatch(/unit="/)
  })
})
