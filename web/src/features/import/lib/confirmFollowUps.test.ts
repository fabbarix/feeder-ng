// BR-E: what follows a Confirm that created Base recipes: "Read Béchamel now" and the bulk link sheet. Pure; RED until lib/confirmFollowUps.ts exists.
import { describe, expect, it } from 'vitest'
import { applied, confirmed } from '../fixtures.baseRecipes.test-helper'
import { bulkLinkTargets, readNextItems, readNextLabel } from './confirmFollowUps'

const lasagne = applied({ index: 0, id: 10, name: 'Lasagne' })
const bechamel = (over = {}) => applied({ index: 1, id: 3, name: 'Béchamel', baseRecipe: true, line: '$.recipes[0].ingredients[1]', ...over })

describe('readNextItems (the Confirm answer\'s line and readNext)', () => {
  it('lists a created Base recipe the User chose to read next, with the line that asked for it', () => {
    const result = confirmed([lasagne, bechamel({ readNext: true })])
    expect(readNextItems(result)).toEqual([{ recipeId: 3, name: 'Béchamel', line: '$.recipes[0].ingredients[1]' }])
  })

  it('leaves out a Base recipe filled in later, a plannable Recipe and a converted one', () => {
    const result = confirmed([lasagne, bechamel(), bechamel({ id: 4, name: 'Pesto', action: 'converted' })])
    expect(readNextItems(result)).toEqual([])
  })

  it('needs readNext on a created Base recipe: readNext on a plannable Recipe is ignored', () => {
    expect(readNextItems(confirmed([applied({ readNext: true, baseRecipe: false })]))).toEqual([])
  })

  it('reads an old answer (no baseRecipe field) as no follow-up', () => {
    const old = { recipes: [{ index: 0, id: 1, name: 'A', action: 'created' as const }], ingredientsCreated: 0, conversionsAdded: 0 }
    expect(readNextItems(old)).toEqual([])
    expect(bulkLinkTargets(old)).toEqual([])
  })

  it('words the action "Read Béchamel now"', () => {
    expect(readNextLabel('Béchamel')).toBe('Read Béchamel now')
  })
})

describe('bulkLinkTargets (design §13: each Base recipe the import created or converted)', () => {
  it('lists created and converted Base recipes, in the answer\'s order', () => {
    const result = confirmed([lasagne, bechamel(), bechamel({ id: 4, name: 'Pesto', action: 'converted', line: '$.recipes[0].ingredients[2]' })])
    expect(bulkLinkTargets(result)).toEqual([{ id: 3, name: 'Béchamel' }, { id: 4, name: 'Pesto' }])
  })

  it('leaves out plannable Recipes and replaced ones', () => {
    const result = confirmed([lasagne, applied({ id: 5, name: 'Roux', action: 'replaced', baseRecipe: true })])
    expect(bulkLinkTargets(result)).toEqual([])
  })

  it('lists a Base recipe of the file (no line) too', () => {
    expect(bulkLinkTargets(confirmed([applied({ id: 6, name: 'Roux', baseRecipe: true })]))).toEqual([{ id: 6, name: 'Roux' }])
  })
})
