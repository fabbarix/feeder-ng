import { describe, expect, it } from 'vitest'
import type { StockLot, StoragePlace } from '../types'
import { DEFAULT_VIEW, UNSORTED, activeFilterCount, filterLots, pantryGroups, sortLots, toggle } from './pantry'

const places: StoragePlace[] = [
  { id: 1, name: 'Kitchen Pantry', kind: 'pantry', default: true },
  { id: 2, name: 'Garage Freezer', kind: 'freezer', default: false },
  { id: 3, name: 'Garage Fridge', kind: 'fridge', default: false },
]
const lot = (over: Partial<StockLot>): StockLot => ({
  id: 1, ingredientId: 1, ingredientName: 'rice', baseUnit: 'g', quantity: 500, purchased: '2026-11-01', goesOff: null,
  source: 'manual', productId: null, shopId: null, spoiled: false, useSoon: false, storagePlaceId: 1, ...over,
})
const lots = [
  lot({ id: 1, ingredientName: 'Rice', quantity: 1000, purchased: '2026-10-01', storagePlaceId: 1 }),
  lot({ id: 2, ingredientName: 'Minced beef', quantity: 500, purchased: '2026-11-10', goesOff: '2027-02-08', storagePlaceId: 2 }),
  lot({ id: 3, ingredientName: 'Milk', quantity: 1000, purchased: '2026-11-09', goesOff: '2026-11-12', useSoon: true, storagePlaceId: 3 }),
  lot({ id: 4, ingredientName: 'Spinach', quantity: 200, purchased: '2026-11-02', goesOff: '2026-11-08', spoiled: true, storagePlaceId: 3 }),
  lot({ id: 5, ingredientName: 'Crème fraîche', quantity: 200, purchased: '2026-11-05', goesOff: '2026-11-15', storagePlaceId: null }),
]
const ids = (ls: StockLot[]) => ls.map((l) => l.id)

describe('filterLots', () => {
  it('keeps everything by default', () => {
    expect(ids(filterLots(lots, places, DEFAULT_VIEW))).toEqual([1, 2, 3, 4, 5])
  })
  it('filters by status, Storage Place (and "Not sorted"), kind and a folded search', () => {
    expect(ids(filterLots(lots, places, { ...DEFAULT_VIEW, status: 'useSoon' }))).toEqual([3])
    expect(ids(filterLots(lots, places, { ...DEFAULT_VIEW, status: 'spoiled' }))).toEqual([4])
    expect(ids(filterLots(lots, places, { ...DEFAULT_VIEW, places: [3, UNSORTED] }))).toEqual([3, 4, 5])
    expect(ids(filterLots(lots, places, { ...DEFAULT_VIEW, kinds: ['freezer', 'pantry'] }))).toEqual([1, 2])
    expect(ids(filterLots(lots, places, { ...DEFAULT_VIEW, query: 'creme' }))).toEqual([5])
    expect(ids(filterLots(lots, places, { ...DEFAULT_VIEW, query: 'MINCED be' }))).toEqual([2])
  })
})

describe('sortLots', () => {
  it('good until: soonest first, no go-off date last', () => {
    expect(ids(sortLots(lots, 'goodUntil'))).toEqual([4, 3, 5, 2, 1])
  })
  it('name, quantity (largest first), purchased (newest first), Storage Place', () => {
    expect(ids(sortLots(lots, 'name'))).toEqual([5, 3, 2, 1, 4])
    expect(ids(sortLots(lots, 'quantity'))).toEqual([3, 1, 2, 5, 4])
    expect(ids(sortLots(lots, 'purchased'))).toEqual([2, 3, 5, 4, 1])
    expect(ids(sortLots(lots, 'place', places))).toEqual([2, 4, 3, 1, 5])
  })
  it('does not mutate', () => {
    const copy = [...lots]
    sortLots(lots, 'name')
    expect(lots).toEqual(copy)
  })
})

describe('pantryGroups', () => {
  it('groups by Storage Place name, then "Not sorted", leaving empty places out', () => {
    const groups = pantryGroups(lots, places, { ...DEFAULT_VIEW, status: 'all' })
    expect(groups.map((g) => g.place?.name ?? 'Not sorted')).toEqual(['Garage Freezer', 'Garage Fridge', 'Kitchen Pantry', 'Not sorted'])
    expect(ids(groups[1]!.lots)).toEqual([4, 3])
    expect(pantryGroups(lots, places, { ...DEFAULT_VIEW, places: [2] }).map((g) => g.key)).toEqual([2])
  })
  it('a Lot whose place is gone counts as Not sorted', () => {
    const groups = pantryGroups([lot({ id: 9, storagePlaceId: 77 })], places, DEFAULT_VIEW)
    expect(groups.map((g) => g.key)).toEqual([UNSORTED])
  })
  it('one group when not grouping, none when nothing matches', () => {
    expect(pantryGroups(lots, places, { ...DEFAULT_VIEW, groupByPlace: false }).map((g) => g.lots.length)).toEqual([5])
    expect(pantryGroups(lots, places, { ...DEFAULT_VIEW, query: 'zzz' })).toEqual([])
  })
})

describe('toggle and activeFilterCount', () => {
  it('toggles an item in and out', () => {
    expect(toggle([1, 2], 3)).toEqual([1, 2, 3])
    expect(toggle([1, 2], 1)).toEqual([2])
  })
  it('counts the filters that are not the default', () => {
    expect(activeFilterCount(DEFAULT_VIEW)).toBe(0)
    expect(activeFilterCount({ ...DEFAULT_VIEW, status: 'spoiled', places: [1], kinds: ['freezer'], query: 'x' })).toBe(3)
  })
})
