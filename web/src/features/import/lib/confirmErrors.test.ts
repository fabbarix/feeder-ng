// BR-E: the refusals of Confirm that concern Base recipes, read from the ApiError exactly as internal/recipefile/httpapi sends them
// (httpapi.go writeApplyError / import_not_ready; apply_error_round5_test.go). Pure; RED until lib/confirmErrors.ts exists.
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/http'
import { baseLine } from '../fixtures.baseRecipes.test-helper'
import { plan } from '../fixtures.test-helper'
import { confirmProblem } from './confirmErrors'

describe('confirmProblem', () => {
  it('422 base_recipe_cycle carries the Recipe names and no tile path: names the cycle with the server\'s words', () => {
    const err = new ApiError(422, 'base_recipe_cycle', 'Béchamel calls for Roux, which calls for Béchamel', { path: ['Béchamel', 'Roux', 'Béchamel'] })
    expect(confirmProblem(err)).toEqual({
      kind: 'cycle',
      message: 'Béchamel calls for Roux, which calls for Béchamel',
      path: ['Béchamel', 'Roux', 'Béchamel'],
    })
  })

  it('reads a cycle without a path as a cycle with an empty path', () => {
    const p = confirmProblem(new ApiError(422, 'base_recipe_cycle', 'base recipe cycle'))
    expect(p).toMatchObject({ kind: 'cycle', path: [] })
  })

  it('409 base_recipe_take_over (the Recipe API shape) is a take-over ask', () => {
    const err = new ApiError(409, 'base_recipe_take_over', 'an Ingredient named béchamel exists: take it over?', {
      ingredient: { id: 5, name: 'béchamel' },
      recipes: [{ id: 11, name: 'Moussaka', archived: false }],
      stockLots: 2,
      convertible: true,
    })
    expect(confirmProblem(err)).toEqual({
      kind: 'takeOver',
      ask: { ingredient: { id: 5, name: 'béchamel' }, recipes: [{ id: 11, name: 'Moussaka' }], stockLots: 2, convertible: true },
    })
  })

  it('422 validation_failed with reason base_recipe_kind says a Base recipe cannot be planned', () => {
    const err = new ApiError(422, 'validation_failed', 'a Base recipe cannot be planned', { field: 'baseRecipe', reason: 'base_recipe_kind' })
    expect(confirmProblem(err)).toEqual({ kind: 'validation', reason: 'base_recipe_kind', message: 'A Base recipe cannot be planned.' })
  })

  it('another validation_failed reason of the Base recipe family uses the shared words (name taken)', () => {
    const err = new ApiError(422, 'validation_failed', 'x', { field: 'name', reason: 'base_recipe_name_taken' })
    expect(confirmProblem(err)).toMatchObject({ kind: 'validation', message: 'Another Base recipe already has this name. Choose a different name.' })
  })

  it('a validation_failed with no known reason keeps the server\'s message', () => {
    const err = new ApiError(422, 'validation_failed', 'That photo cannot be used for this Recipe', { field: 'photo' })
    expect(confirmProblem(err)).toEqual({ kind: 'validation', reason: undefined, message: 'That photo cannot be used for this Recipe' })
  })

  it('422 import_not_ready carries the server\'s plan and message', () => {
    const p = plan({ ready: false, baseRecipeLines: [baseLine()] })
    const err = new ApiError(422, 'import_not_ready', 'Finish the Import Review before confirming', { plan: p })
    expect(confirmProblem(err)).toEqual({ kind: 'notReady', message: 'Finish the Import Review before confirming', plan: p })
  })

  it('is null for any other error (import_stale, forbidden, a network error)', () => {
    expect(confirmProblem(new ApiError(409, 'import_stale', 'x'))).toBeNull()
    expect(confirmProblem(new ApiError(403, 'forbidden', 'x'))).toBeNull()
    expect(confirmProblem(new Error('offline'))).toBeNull()
  })
})
