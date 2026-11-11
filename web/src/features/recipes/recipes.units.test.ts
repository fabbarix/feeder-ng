// Units shown beside NumberFields are copy: they live in recipeStrings, not in the components.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { recipeStrings } from './strings'

describe('Recipes unit suffixes', () => {
  it('recipeStrings holds the day and minute units', () => {
    expect(recipeStrings.units).toEqual({ days: 'days', min: 'min' })
  })
  it.each(['RecipeDetailsFields.tsx', 'StepsEditor.tsx'])('%s has no literal unit="..."', (file) => {
    const src = readFileSync(join(__dirname, 'components', file), 'utf8')
    expect(src).not.toMatch(/unit="/)
  })
})
