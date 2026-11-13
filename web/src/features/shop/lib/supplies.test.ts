import { describe, expect, it } from 'vitest'
import { makeExtra, makeLine, makeList } from '../testData'
import { listEntries } from './lines'
import { restockText, splitSupplies } from './supplies'

// H7': the Shop screen's Supplies group (docs/dev/design/household-items.md §4.4). Pure functions, no React.
// Contract (H4): a Line has kind 'food' | 'supply' and restock {level, stock} | null (Base Units); an Ingredient extra has
// kind 'food' | 'supply', a free-text extra has kind null. A field absent in an older saved list means food.

const food = (id: number, name: string, over = {}) => makeLine({ ingredientId: id, name, pack: null, estimatedCostCents: null, quantity: 500, ...over })
const supply = (id: number, name: string, over = {}) =>
  makeLine({ ingredientId: id, name, baseUnit: 'piece', kind: 'supply', restock: { level: 6, stock: 2 }, quantity: 4, need: 6, available: 2, pack: null, estimatedCostCents: null, ...over })

describe('restockText: why a Restock Line is on the list', () => {
  it('a piece Supply: the bare numbers, "Below 6 · 2 in Stock"', () => {
    expect(restockText({ level: 6, stock: 2 }, 'piece', 'metric')).toBe('Below 6 · 2 in Stock')
  })
  it('no Stock at all says "None in Stock"', () => {
    expect(restockText({ level: 6, stock: 0 }, 'piece', 'metric')).toBe('Below 6 · None in Stock')
  })
  it('a g or ml Supply carries its unit, in the display unit system', () => {
    expect(restockText({ level: 500, stock: 200 }, 'ml', 'metric')).toBe('Below 500 ml · 200 ml in Stock')
    expect(restockText({ level: 500, stock: 0 }, 'g', 'metric')).toBe('Below 500 g · None in Stock')
    expect(restockText({ level: 500, stock: 200 }, 'g', 'imperial')).toBe('Below 17.6 oz · 7.1 oz in Stock')
  })
})

describe('lineEntry / extraEntry carry the kind and the reason', () => {
  it('a Supply Line is a supply entry with its restockText', () => {
    const e = listEntries(makeList({ lines: [supply(20, 'Toilet paper')] }), 'metric').open[0]!
    expect(e.supply).toBe(true)
    expect(e.restockText).toBe('Below 6 · 2 in Stock')
  })
  it('a Supply Line without restock info (ticked after Stock was bought, or by hand) is a supply with no reason', () => {
    const e = listEntries(makeList({ lines: [supply(20, 'Toilet paper', { restock: null })] }), 'metric').open[0]!
    expect(e.supply).toBe(true)
    expect(e.restockText).toBe('')
  })
  it('a food Line, and a Line from an older saved list (no kind), are not supplies and have no reason', () => {
    const { open } = listEntries(makeList({ lines: [food(1, 'Rice', { kind: 'food', restock: null }), food(2, 'Dill')] }), 'metric')
    expect(open.map((e) => [e.supply, e.restockText])).toEqual([[false, ''], [false, '']])
  })
  it('an Ingredient extra of a Supply is a supply entry; free text and food extras are not', () => {
    const extras = [
      makeExtra({ id: 1, text: null, ingredientId: 20, name: 'Toilet paper', baseUnit: 'piece', quantity: 9, kind: 'supply' }),
      makeExtra({ id: 2, text: null, ingredientId: 3, name: 'milk', baseUnit: 'ml', quantity: 1000, kind: 'food' }),
      makeExtra({ id: 3, text: 'candles', kind: null }),
    ]
    const { open } = listEntries(makeList({ lines: [], extras }), 'metric')
    expect(open.map((e) => e.supply)).toEqual([true, false, false])
    expect(open.every((e) => e.restockText === '')).toBe(true)
  })
})

describe('splitSupplies: food first, Supplies after, each in the order given', () => {
  const entries = (lines = [supply(20, 'Toilet paper'), food(1, 'Rice'), supply(21, 'Bin bags'), food(2, 'Dill')], extras = [makeExtra({ id: 1, text: null, ingredientId: 22, name: 'Soap', baseUnit: 'piece', quantity: 2, kind: 'supply' }), makeExtra({ id: 2, text: 'candles', kind: null })]) =>
    listEntries(makeList({ lines, extras }), 'metric').open

  it('separates the food entries from the Supply entries and keeps each side stable', () => {
    const { food: f, supplies } = splitSupplies(entries())
    expect(f.map((e) => e.title)).toEqual(['Rice', 'Dill', 'candles'])
    expect(supplies.map((e) => e.title)).toEqual(['Toilet paper', 'Bin bags', 'Soap'])
  })
  it('Supply Lines come before Supply extras (Lines then extras, as the open list does)', () => {
    const { supplies } = splitSupplies(entries())
    expect(supplies.map((e) => e.kind)).toEqual(['line', 'line', 'extra'])
  })
  it('a food-only list has an empty Supplies side and the food side is the input, unchanged', () => {
    const input = entries([food(1, 'Rice'), food(2, 'Dill')], [])
    const out = splitSupplies(input)
    expect(out.supplies).toEqual([])
    expect(out.food).toEqual(input)
  })
  it('a Supplies-only list has an empty food side; an empty input gives two empty sides', () => {
    expect(splitSupplies(entries([supply(20, 'Toilet paper')], [])).food).toEqual([])
    expect(splitSupplies([])).toEqual({ food: [], supplies: [] })
  })
  it('does not mutate its input', () => {
    const input = entries()
    const copy = [...input]
    splitSupplies(input)
    expect(input).toEqual(copy)
  })
})
