// H5: the pure rules of Supplies in the web catalogue (docs/dev/design/household-items.md section 4.8, 6; ADR 0017).
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/http'
import { dishSoapJSON, garlicJSON } from '../supply.test-helper'
import { checkRestockLevel, kindBasePath, kindInUseFrom, kindInUseReasons, kindInUseTitle, kindOf, restockSummary, supplyMeta } from './kind'
import { errorMessage } from './errorMessage'

describe('kindOf', () => {
  it('reads the kind of an Ingredient, and treats an older fixture without one as food', () => {
    expect(kindOf(garlicJSON)).toBe('food')
    expect(kindOf(dishSoapJSON)).toBe('supply')
    expect(kindOf({})).toBe('food')
  })
})

describe('kindBasePath (decision D5: Supplies have their own routes)', () => {
  it('maps a kind to its list route', () => {
    expect(kindBasePath('food')).toBe('/ingredients')
    expect(kindBasePath('supply')).toBe('/supplies')
  })
})

describe('kindInUseReasons: the 409 kind_in_use reasons in words', () => {
  it('words each reason code', () => {
    expect(kindInUseReasons(['recipe_lines'])).toEqual(['It is on a Recipe line'])
    expect(kindInUseReasons(['exclusions'])).toEqual(['A Member excludes it'])
    expect(kindInUseReasons(['base_recipe'])).toEqual(["It is a Base recipe's Ingredient"])
  })
  it('keeps the server order and drops a code it does not know', () => {
    expect(kindInUseReasons(['base_recipe', 'recipe_lines', 'mystery', 'exclusions'])).toEqual([
      "It is a Base recipe's Ingredient",
      'It is on a Recipe line',
      'A Member excludes it',
    ])
  })
  it('titles the refusal by the kind it was going to become', () => {
    expect(kindInUseTitle('supply')).toBe("It can't become a Supply yet")
    expect(kindInUseTitle('food')).toBe("It can't become food yet")
  })
  it('reads the reasons off a 409 kind_in_use ApiError, and off nothing else', () => {
    expect(kindInUseFrom(new ApiError(409, 'kind_in_use', 'x', { reasons: ['recipe_lines', 'exclusions'] }))).toEqual(['recipe_lines', 'exclusions'])
    expect(kindInUseFrom(new ApiError(409, 'kind_in_use', 'x'))).toEqual([])
    expect(kindInUseFrom(new ApiError(409, 'name_taken', 'x'))).toBeNull()
    expect(kindInUseFrom(new Error('boom'))).toBeNull()
  })
})

describe('checkRestockLevel (a number in Base Units; Supplies only, decision D3)', () => {
  it('accepts a positive number and null (no level)', () => {
    expect(checkRestockLevel(6)).toEqual({ ok: true, value: 6 })
    expect(checkRestockLevel(0.5)).toEqual({ ok: true, value: 0.5 })
    expect(checkRestockLevel(null)).toEqual({ ok: true, value: null })
  })
  it('refuses zero, a negative and a non-finite number with the amount message', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(checkRestockLevel(bad)).toEqual({ ok: false, error: 'Enter an amount greater than 0' })
    }
  })
})

describe('restockSummary: the level in the household unit display', () => {
  it('says there is none', () => {
    expect(restockSummary(null, 'piece', 'metric')).toBe('No Restock level')
  })
  it('words a level in Base Units with the Household unit display', () => {
    expect(restockSummary(6, 'piece', 'metric')).toBe('Below 6 pieces')
    expect(restockSummary(1, 'piece', 'metric')).toBe('Below 1 piece')
    expect(restockSummary(500, 'ml', 'metric')).toBe('Below 500 ml')
    expect(restockSummary(500, 'ml', 'imperial')).toBe('Below 2 cups')
    expect(restockSummary(100, 'g', 'imperial')).toBe('Below 3.5 oz')
  })
})

describe('supplyMeta: the row meta of the Supplies list', () => {
  it('is the Base Unit label, and the level when there is one', () => {
    expect(supplyMeta('piece', 6, 'piece', 'metric')).toBe('piece · restocks below 6 pieces')
    expect(supplyMeta('ml', null, 'ml', 'metric')).toBe('ml')
  })
})

describe('errorMessage: H2 refusals in words', () => {
  it('words the 422 validation_failed reasons', () => {
    expect(errorMessage(new ApiError(422, 'validation_failed', 'x', { reason: 'supply_has_shelf_life' }))).toBe('A Supply has no Shelf Life')
    expect(errorMessage(new ApiError(422, 'validation_failed', 'x', { reason: 'restock_level_on_food' }))).toBe('Only a Supply has a Restock level')
  })
  it('keeps the generic message for anything else', () => {
    expect(errorMessage(new ApiError(422, 'validation_failed', 'x', { reason: 'other' }))).toBe('That did not work. Try again.')
  })
})
