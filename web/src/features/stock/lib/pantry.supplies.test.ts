// Supplies in the Pantry lists (household-items.md 4.2, 4.6): the Food or Supplies filter applies in both lists, and Use soon and
// Spoiled never match a Supply, even if a stray flag says otherwise (a Supply never goes off).
import { describe, expect, it } from 'vitest'
import { makeLot, makeSupplyLot, makeSupplyTotal, makeTotal } from '../testData'
import { filterTotals } from './filter'
import { DEFAULT_VIEW, filterLots, sortLots, type PantryView } from './pantry'

const view = (over: Partial<PantryView> = {}): PantryView => ({ ...DEFAULT_VIEW, ...over })
const food = makeLot({ id: 1, ingredientName: 'rice', kind: 'food', goesOff: null, spoiled: false, useSoon: false })
const soon = makeLot({ id: 2, ingredientName: 'feta', kind: 'food', goesOff: '2026-11-12', spoiled: false, useSoon: true })
const gone = makeLot({ id: 3, ingredientName: 'peas', kind: 'food', goesOff: '2026-11-01', spoiled: true, useSoon: false })
const paper = makeSupplyLot({ id: 4 })
const soap = makeSupplyLot({ id: 5, ingredientId: 41, ingredientName: 'dish soap', baseUnit: 'ml', quantity: 500 })
const all = [food, soon, gone, paper, soap]
const ids = (lots: { id: number }[]) => lots.map((l) => l.id)

describe('filterLots: Food or Supplies', () => {
  it('"all" (the default) keeps both kinds', () => {
    expect(ids(filterLots(all, [], view()))).toEqual([1, 2, 3, 4, 5])
  })
  it('"food" keeps the food Lots', () => {
    expect(ids(filterLots(all, [], view({ stock: 'food' })))).toEqual([1, 2, 3])
  })
  it('"supply" keeps the Supply Lots', () => {
    expect(ids(filterLots(all, [], view({ stock: 'supply' })))).toEqual([4, 5])
  })
  it('a Lot with no kind (an older fixture) is food', () => {
    const old = makeLot({ id: 9 })
    expect(ids(filterLots([old, paper], [], view({ stock: 'food' })))).toEqual([9])
    expect(ids(filterLots([old, paper], [], view({ stock: 'supply' })))).toEqual([4])
  })
  it('combines with the search and the Storage Place filters', () => {
    const placed = makeSupplyLot({ id: 6, ingredientName: 'bin bags', storagePlaceId: 2 })
    const other = makeSupplyLot({ id: 7, ingredientName: 'batteries', storagePlaceId: 1 })
    expect(ids(filterLots([placed, other, food], [], view({ stock: 'supply', places: [2] })))).toEqual([6])
    expect(ids(filterLots([placed, other, food], [], view({ stock: 'supply', query: 'batt' })))).toEqual([7])
  })
})

describe('Use soon and Spoiled never match a Supply', () => {
  it('a Supply passes neither, whatever its flags say', () => {
    const stray = makeSupplyLot({ id: 8, useSoon: true, spoiled: true })
    expect(ids(filterLots([stray, soon, gone], [], view({ status: 'useSoon' })))).toEqual([2])
    expect(ids(filterLots([stray, soon, gone], [], view({ status: 'spoiled' })))).toEqual([3])
  })
  it('with Supplies chosen and Use soon on, nothing matches', () => {
    expect(filterLots(all, [], view({ stock: 'supply', status: 'useSoon' }))).toEqual([])
    expect(filterLots(all, [], view({ stock: 'supply', status: 'spoiled' }))).toEqual([])
  })
})

describe('sorting a Supply by Good until puts it after the dated food, by name', () => {
  it('no go-off date sorts last', () => {
    expect(ids(sortLots([paper, soon, soap], 'goodUntil'))).toEqual([2, 5, 4])
  })
})

describe('filterTotals (By Ingredient)', () => {
  const rice = makeTotal({ ingredientId: 1, name: 'rice', kind: 'food', useSoon: false, spoiledCount: 0 })
  const feta = makeTotal({ ingredientId: 2, name: 'feta', kind: 'food', useSoon: true, spoiledCount: 0 })
  const peas = makeTotal({ ingredientId: 3, name: 'peas', kind: 'food', useSoon: false, spoiledCount: 2 })
  const tp = makeSupplyTotal()
  const names = (items: { name: string }[]) => items.map((i) => i.name)
  it('keeps the kind chosen; the fourth argument is optional and defaults to both', () => {
    const items = [rice, feta, peas, tp]
    expect(names(filterTotals(items, 'all', ''))).toEqual(['rice', 'feta', 'peas', 'toilet paper'])
    expect(names(filterTotals(items, 'all', '', 'food'))).toEqual(['rice', 'feta', 'peas'])
    expect(names(filterTotals(items, 'all', '', 'supply'))).toEqual(['toilet paper'])
    expect(names(filterTotals(items, 'all', 'paper', 'all'))).toEqual(['toilet paper'])
  })
  it('Use soon and Spoiled never match a Supply, whatever its flags say', () => {
    const stray = makeSupplyTotal({ useSoon: true, spoiledCount: 1 })
    expect(names(filterTotals([feta, stray], 'useSoon', ''))).toEqual(['feta'])
    expect(names(filterTotals([peas, stray], 'spoiled', ''))).toEqual(['peas'])
    expect(filterTotals([stray], 'useSoon', '', 'supply')).toEqual([])
  })
})
