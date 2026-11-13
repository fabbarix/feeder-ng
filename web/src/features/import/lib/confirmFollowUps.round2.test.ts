// BR-E round 2: hasFollowUps (lib/confirmFollowUps.ts) decides whether the done step shows the follow-ups. RED until it exists.
import { describe, expect, it } from 'vitest'
import { applied, confirmed } from '../fixtures.baseRecipes.test-helper'
import { hasFollowUps } from './confirmFollowUps'

describe('hasFollowUps', () => {
  it('is false for plannable Recipes only, and for a replaced Base recipe', () => {
    expect(hasFollowUps(confirmed([applied()]))).toBe(false)
    expect(hasFollowUps(confirmed([applied({ baseRecipe: true, action: 'replaced' })]))).toBe(false)
  })

  it('is true when a Base recipe was created or converted (the bulk link sheet), or asked to be read next', () => {
    expect(hasFollowUps(confirmed([applied({ baseRecipe: true })]))).toBe(true)
    expect(hasFollowUps(confirmed([applied({ baseRecipe: true, action: 'converted' })]))).toBe(true)
    expect(hasFollowUps(confirmed([applied({ baseRecipe: true, readNext: true })]))).toBe(true)
  })

  it('is false for an old answer with no baseRecipe field', () => {
    expect(hasFollowUps({ recipes: [{ index: 0, id: 1, name: 'A', action: 'created' }], ingredientsCreated: 0, conversionsAdded: 0 })).toBe(false)
  })
})
