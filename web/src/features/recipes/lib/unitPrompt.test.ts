import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/http'
import { parseToBase, parseUnknownUnit, promptQuestion } from './unitPrompt'

const unknownUnit = (details: Record<string, unknown>) => new ApiError(422, 'unknown_unit', 'No', details)

describe('parseUnknownUnit', () => {
  it('reads a line problem', () => {
    const p = parseUnknownUnit(unknownUnit({ field: 'lines[1].unit', ingredientId: 7, ingredient: 'garlic', unit: 'clove', baseUnit: 'g' }))
    expect(p).toEqual({
      field: 'lines[1].unit', lineIndex: 1, useRef: null, ingredientId: 7, ingredientName: 'garlic', unit: 'clove', baseUnit: 'g',
    })
  })

  it('reads a Step use problem', () => {
    const p = parseUnknownUnit(unknownUnit({ field: 'steps[2].uses[0].unit', ingredientId: 7, ingredient: 'garlic', unit: 'head', baseUnit: 'g' }))
    expect(p).toMatchObject({ lineIndex: null, useRef: [2, 0], unit: 'head' })
  })

  it('ignores other errors and malformed details', () => {
    expect(parseUnknownUnit(new ApiError(422, 'validation_failed', 'x', { field: 'name' }))).toBeNull()
    expect(parseUnknownUnit(unknownUnit({ field: 'lines[x].unit' }))).toBeNull()
    expect(parseUnknownUnit(unknownUnit({ field: 'lines[0].unit', ingredientId: 1, ingredient: 'a', unit: 'u', baseUnit: 'stone' }))).toBeNull()
    expect(parseUnknownUnit(new Error('boom'))).toBeNull()
    expect(parseUnknownUnit(undefined)).toBeNull()
  })
})

describe('promptQuestion', () => {
  it('names the unit, the Ingredient and the Base Unit', () => {
    const p = parseUnknownUnit(unknownUnit({ field: 'lines[0].unit', ingredientId: 7, ingredient: 'garlic', unit: 'clove', baseUnit: 'g' }))!
    expect(promptQuestion(p)).toBe('How many g is 1 clove of garlic?')
  })
})

describe('promptQuestion plural (R10)', () => {
  it('asks "How many pieces", never "How many piece"', () => {
    const p = parseUnknownUnit(unknownUnit({ field: 'lines[0].unit', ingredientId: 3, ingredient: 'onion', unit: 'cup', baseUnit: 'piece' }))!
    expect(promptQuestion(p)).toBe('How many pieces is 1 cup of onion?')
  })
})

describe('parseToBase', () => {
  it('accepts positive numbers', () => {
    expect(parseToBase('5')).toBe(5)
    expect(parseToBase('2,5')).toBe(2.5)
    expect(parseToBase('1/4')).toBe(0.25)
  })
  it('rejects zero, negatives and text', () => {
    for (const bad of ['0', '-3', 'a lot', '']) expect(parseToBase(bad)).toBeNull()
  })
})
