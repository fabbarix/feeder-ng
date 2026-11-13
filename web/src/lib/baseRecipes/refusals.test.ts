import { describe, expect, it } from 'vitest'
import { ApiError } from '../http'
import { cycleMessage, inUseRefusal, refusalMessage } from './refusals'

const unprocessable = (reason: string, details: Record<string, unknown> = {}) => new ApiError(422, 'validation_failed', reason, { field: 'x', reason, ...details })

describe('cycleMessage', () => {
  it('walks the path: A calls for B, which calls for A', () => {
    expect(cycleMessage(['Roux', 'Béchamel', 'Roux'])).toBe('Roux calls for Béchamel, which calls for Roux')
    expect(cycleMessage(['A', 'B', 'C', 'A'])).toBe('A calls for B, which calls for C, which calls for A')
  })
  it('says itself for a Base recipe that calls for itself', () => {
    expect(cycleMessage(['Béchamel', 'Béchamel'])).toBe('Béchamel calls for itself')
  })
})

describe('refusalMessage (422 validation_failed reasons and the 409 guards)', () => {
  it('words the cycle from the path the server sends', () => {
    expect(refusalMessage(unprocessable('base_recipe_cycle', { path: ['Roux', 'Béchamel', 'Roux'] }))).toBe('Roux calls for Béchamel, which calls for Roux')
  })
  it.each([
    ['base_recipe_name_taken', 'Another Base recipe already has this name. Choose a different name.'],
    ['ready_meal_name_taken', 'A Ready Meal already has this name. Choose a different name.'],
    ['yield_unit_invalid', 'Choose a unit for the Yield.'],
    ['base_recipe_ready_meal', 'A Ready Meal cannot be a Base recipe.'],
    ['not_a_candidate', 'One of those lines can no longer be linked. Reopen the list.'],
    ['line_not_plain', 'That line already calls for a Base recipe.'],
    ['line_not_base', 'That line is already a plain Ingredient.'],
  ])('%s', (reason, message) => expect(refusalMessage(unprocessable(reason))).toBe(message))
  it('names the Ingredient that stops a Base recipe becoming a Recipe again', () => {
    const e = new ApiError(409, 'ingredient_name_taken', 'x', { ingredient: { id: 5, name: 'béchamel' } })
    expect(refusalMessage(e)).toBe('An Ingredient named béchamel already exists. Merge or rename it first.')
  })
  it('tells you to rename the Base recipe, not its Ingredient', () => {
    expect(refusalMessage(new ApiError(409, 'base_recipe_ingredient', 'x'))).toBe('This Ingredient belongs to a Base recipe. Rename the Base recipe instead.')
  })
  it('is null for errors that are not Base recipe refusals', () => {
    expect(refusalMessage(new ApiError(500, 'internal', 'x'))).toBeNull()
    expect(refusalMessage(unprocessable('name_required'))).toBeNull()
    expect(refusalMessage(new Error('x'))).toBeNull()
  })
})

describe('inUseRefusal (delete or turn back a Base recipe that Recipes call for)', () => {
  it('names who uses it and offers Archive instead', () => {
    const e = new ApiError(409, 'base_recipe_in_use', 'x', { usedBy: [{ id: 1, name: 'Lasagne' }, { id: 2, name: 'Moussaka' }] })
    expect(inUseRefusal(e, 'Béchamel')).toEqual({
      message: 'Béchamel is used in Lasagne and Moussaka',
      usedBy: [{ id: 1, name: 'Lasagne' }, { id: 2, name: 'Moussaka' }],
      alternate: 'Archive instead',
    })
  })
  it('joins three or more with commas', () => {
    const e = new ApiError(409, 'base_recipe_in_use', 'x', { usedBy: ['A', 'B', 'C'].map((name, i) => ({ id: i, name })) })
    expect(inUseRefusal(e, 'Béchamel')?.message).toBe('Béchamel is used in A, B and C')
  })
  it('is null for another error', () => {
    expect(inUseRefusal(new ApiError(409, 'already_planned', 'x'), 'Béchamel')).toBeNull()
  })
})
