// B9-45 (PC-02): the rows of the one Stock-shortfall notice and of the one Correct Stock sheet (pure; amounts are never summed across Recipes).
import { describe, expect, it } from 'vitest'
import { formatQuantity } from '../../../lib/units'
import type { StockWarning } from '../types'
import {
  correctedText,
  correctionRows,
  correctionStep,
  correctionWrites,
  shortfallDetail,
  shortfallRows,
  shortfallState,
  shortfallTitle,
  type ShortfallGroup,
} from './shortfall'

const w = (ingredientId: number, name: string, have: number, need: number, baseUnit: StockWarning['baseUnit'] = 'g'): StockWarning => ({
  ingredientId, name, baseUnit, have, need, shortfall: need - have, message: `Stock shows only ${have} ${name}, the recipe uses ${need}`,
})
const cauliflower = w(1, 'Cauliflower', 0, 800)
const gorgonzola = w(2, 'Gorgonzola', 0, 250)
const mushrooms = w(3, 'Chestnut mushrooms', 100, 300)
const dinner: ShortfallGroup = { id: '2026-11-14/3/1', mealLabel: 'Sat Dinner', recipeName: 'Cauliflower al gorgonzola', warnings: [cauliflower, gorgonzola, mushrooms] }

describe('shortfallState', () => {
  it('says "none in Stock" when Stock held nothing', () => {
    expect(shortfallState(gorgonzola)).toBe('none in Stock')
  })
  it('says how much is missing when Stock held some: "200 g short"', () => {
    expect(shortfallState(mushrooms)).toBe('200 g short')
  })
  it('writes the missing amount in the User\'s unit system', () => {
    expect(shortfallState(mushrooms, 'imperial')).toBe(`${formatQuantity(200, 'g', 'imperial')} short`)
  })
  it('counts pieces', () => {
    expect(shortfallState(w(4, 'Eggs', 2, 6, 'piece'))).toBe('4 pieces short')
  })
})

describe('shortfallDetail', () => {
  it('names what the Recipe used and what Stock showed: "The Recipe used 300 g · Stock showed 100 g"', () => {
    expect(shortfallDetail(mushrooms, 'metric', 'The Recipe')).toBe('The Recipe used 300 g · Stock showed 100 g')
  })
  it('leaves "Stock showed" out when nothing was in Stock (the state says it)', () => {
    expect(shortfallDetail(gorgonzola, 'metric', 'The Recipe')).toBe('The Recipe used 250 g')
  })
  it('names the Recipe when several Recipes are listed: "Chicken curry used 500 g"', () => {
    expect(shortfallDetail(w(5, 'Rice', 0, 500), 'metric', 'Chicken curry')).toBe('Chicken curry used 500 g')
  })
  it('writes amounts as the app does everywhere: 1000 g is "1 kg"', () => {
    expect(shortfallDetail(cauliflower, 'metric', 'The Recipe')).toBe('The Recipe used 800 g')
    expect(shortfallDetail(w(1, 'Cauliflower', 0, 1000), 'metric', 'The Recipe')).toBe('The Recipe used 1 kg')
  })
  it('writes imperial amounts for an imperial User (the server message is metric only)', () => {
    expect(shortfallDetail(mushrooms, 'imperial', 'The Recipe')).toBe(`The Recipe used ${formatQuantity(300, 'g', 'imperial')} · Stock showed ${formatQuantity(100, 'g', 'imperial')}`)
  })
})

describe('shortfallRows', () => {
  it('is one row per Ingredient with key, state and detail, in order', () => {
    expect(shortfallRows([dinner])).toEqual([
      { key: '2026-11-14/3/1:1', groupId: '2026-11-14/3/1', ingredientId: 1, name: 'Cauliflower', state: 'none in Stock', detail: 'The Recipe used 800 g' },
      { key: '2026-11-14/3/1:2', groupId: '2026-11-14/3/1', ingredientId: 2, name: 'Gorgonzola', state: 'none in Stock', detail: 'The Recipe used 250 g' },
      { key: '2026-11-14/3/1:3', groupId: '2026-11-14/3/1', ingredientId: 3, name: 'Chestnut mushrooms', state: '200 g short', detail: 'The Recipe used 300 g · Stock showed 100 g' },
    ])
  })
  it('names each Recipe once two different Recipes are listed, and never sums the amounts', () => {
    const curry: ShortfallGroup = { id: '2026-11-15/3/1', mealLabel: 'Sun Dinner', recipeName: 'Chicken curry', warnings: [w(9, 'Rice', 0, 500)] }
    const roast: ShortfallGroup = { id: '2026-11-16/3/1', mealLabel: 'Mon Dinner', recipeName: 'Roast chicken', warnings: [w(9, 'Rice', 0, 300)] }
    const rows = shortfallRows([curry, roast])
    expect(rows.map((r) => [r.name, r.detail])).toEqual([
      ['Rice', 'Chicken curry used 500 g'],
      ['Rice', 'Roast chicken used 300 g'],
    ])
    expect(new Set(rows.map((r) => r.key)).size).toBe(2)
  })
  it('keeps "The Recipe" when two meals cooked the same Recipe', () => {
    const a: ShortfallGroup = { ...dinner, id: 'a', warnings: [cauliflower] }
    const b: ShortfallGroup = { ...dinner, id: 'b', mealLabel: 'Sun Dinner', warnings: [cauliflower] }
    expect(shortfallRows([a, b]).map((r) => r.detail)).toEqual(['The Recipe used 800 g', 'The Recipe used 800 g'])
  })
  it('says "Cooking used" when the Recipe is not known (a Mark all Cooked of several Courses)', () => {
    const all: ShortfallGroup = { id: '2026-11-14/3', mealLabel: 'Sat Dinner', recipeName: null, warnings: [mushrooms] }
    expect(shortfallRows([all])[0]!.detail).toBe('Cooking used 300 g · Stock showed 100 g')
  })
  it('is empty without warnings', () => {
    expect(shortfallRows([])).toEqual([])
    expect(shortfallRows([{ ...dinner, warnings: [] }])).toEqual([])
  })
})

describe('shortfallTitle', () => {
  it('names the Ingredient when one is short', () => {
    expect(shortfallTitle([{ ...dinner, warnings: [cauliflower] }])).toBe('Stock was short for Cauliflower')
  })
  it('counts the Ingredients when several are', () => {
    expect(shortfallTitle([dinner])).toBe('Stock was short for 3 Ingredients')
  })
  it('counts an Ingredient once however many meals were short of it', () => {
    const a: ShortfallGroup = { ...dinner, id: 'a', warnings: [cauliflower] }
    const b: ShortfallGroup = { ...dinner, id: 'b', warnings: [cauliflower] }
    expect(shortfallTitle([a, b])).toBe('Stock was short for Cauliflower')
  })
})

describe('correctionRows (the Correct Stock sheet)', () => {
  it('is one row per Ingredient, with what the Recipe used and what Stock showed', () => {
    expect(correctionRows([dinner])).toEqual([
      { ingredientId: 1, name: 'Cauliflower', baseUnit: 'g', detail: 'The Recipe used 800 g · Stock showed none' },
      { ingredientId: 2, name: 'Gorgonzola', baseUnit: 'g', detail: 'The Recipe used 250 g · Stock showed none' },
      { ingredientId: 3, name: 'Chestnut mushrooms', baseUnit: 'g', detail: 'The Recipe used 300 g · Stock showed 100 g' },
    ])
  })
  it('joins the uses of an Ingredient that two Recipes were short of, without summing them', () => {
    const curry: ShortfallGroup = { id: 'a', mealLabel: 'Sun Dinner', recipeName: 'Chicken curry', warnings: [w(9, 'Rice', 0, 500)] }
    const roast: ShortfallGroup = { id: 'b', mealLabel: 'Mon Dinner', recipeName: 'Roast chicken', warnings: [w(9, 'Rice', 0, 300)] }
    expect(correctionRows([curry, roast])).toEqual([
      { ingredientId: 9, name: 'Rice', baseUnit: 'g', detail: 'Chicken curry used 500 g · Roast chicken used 300 g · Stock showed none' },
    ])
  })
})

describe('correctionStep, correctionWrites, correctedText', () => {
  it('steps grams and millilitres by 10 and pieces by 1', () => {
    expect([correctionStep('g'), correctionStep('ml'), correctionStep('piece')]).toEqual([10, 10, 1])
  })
  it('writes one Stock-take per row the User raised above 0, and none for the rest', () => {
    const rows = correctionRows([dinner])
    expect(correctionWrites(rows, { 1: 0, 2: 100, 3: 40 })).toEqual([
      { ingredientId: 2, total: 100 },
      { ingredientId: 3, total: 40 },
    ])
    expect(correctionWrites(rows, {})).toEqual([])
  })
  it('says how many Ingredients were corrected', () => {
    expect(correctedText(2)).toBe('Stock corrected for 2 Ingredients')
    expect(correctedText(1)).toBe('Stock corrected for 1 Ingredient')
  })
})
