import { describe, expect, it } from 'vitest'
import { frozenChilli, leftover, TODAY } from '../../../lib/leftovers/fixtures'
import type { StoragePlace } from '../types'
import { filterPantryLeftovers, leftoverGroups, pantryLeftoverText, pantryLeftovers } from './pantryLeftovers'

const places: StoragePlace[] = [
  { id: 1, name: 'Kitchen Pantry', kind: 'pantry', default: true },
  { id: 2, name: 'Garage Freezer', kind: 'freezer', default: false },
  { id: 3, name: 'Garage Fridge', kind: 'fridge', default: false },
  { id: 4, name: 'Basement Freezer', kind: 'freezer', default: false },
]
const ids = (ls: { id: number }[]) => ls.map((l) => l.id)

describe('pantryLeftovers', () => {
  it('shows frozen Leftovers with portions left, nothing else', () => {
    const all = [
      frozenChilli({ id: 1 }),
      leftover({ id: 2 }),
      leftover({ id: 3, storagePlaceId: 3, storagePlaceName: 'Garage Fridge' }),
      frozenChilli({ id: 4, portions: 0 }),
    ]
    expect(ids(pantryLeftovers(all))).toEqual([1])
  })
})

describe('leftoverGroups', () => {
  it('groups by Storage Place in place order, only places that hold one', () => {
    const groups = leftoverGroups(
      [frozenChilli({ id: 1, storagePlaceId: 2 }), frozenChilli({ id: 2, storagePlaceId: 4, storagePlaceName: 'Basement Freezer' }), frozenChilli({ id: 3, storagePlaceId: 2 })],
      places,
    )
    expect(groups.map((g) => [g.placeId, g.name, ids(g.leftovers)])).toEqual([
      [2, 'Garage Freezer', [1, 3]],
      [4, 'Basement Freezer', [2]],
    ])
  })
  it('a Leftover with no place, or whose Freezer was deleted, shows under "Not sorted", last', () => {
    const groups = leftoverGroups(
      [frozenChilli({ id: 1, storagePlaceId: null, storagePlaceName: null }), frozenChilli({ id: 2, storagePlaceId: 99 }), frozenChilli({ id: 3, storagePlaceId: 2 })],
      places,
    )
    expect(groups.map((g) => [g.placeId, g.name, ids(g.leftovers)])).toEqual([
      [2, 'Garage Freezer', [3]],
      [0, 'Not sorted', [1, 2]],
    ])
  })
  it('is empty without Leftovers', () => {
    expect(leftoverGroups([], places)).toEqual([])
  })
})

describe('filterPantryLeftovers', () => {
  const all = [
    frozenChilli({ id: 1, recipeName: 'Chilli', storagePlaceId: 2 }),
    frozenChilli({ id: 2, recipeName: 'Crème brûlée', storagePlaceId: 4 }),
    frozenChilli({ id: 3, recipeName: 'Dal', storagePlaceId: null, storagePlaceName: null }),
  ]
  const none = { places: [], kinds: [], search: '' }
  it('keeps everything by default', () => {
    expect(ids(filterPantryLeftovers(all, places, none))).toEqual([1, 2, 3])
  })
  it('filters by place (0 = Not sorted), kind and a folded search', () => {
    expect(ids(filterPantryLeftovers(all, places, { ...none, places: [4] }))).toEqual([2])
    expect(ids(filterPantryLeftovers(all, places, { ...none, places: [0] }))).toEqual([3])
    expect(ids(filterPantryLeftovers(all, places, { ...none, kinds: ['pantry'] }))).toEqual([])
    expect(ids(filterPantryLeftovers(all, places, { ...none, kinds: ['freezer'] }))).toEqual([1, 2])
    expect(ids(filterPantryLeftovers(all, places, { ...none, search: 'creme' }))).toEqual([2])
  })
})

describe('pantryLeftoverText', () => {
  it('names the Recipe and shows portions and the frozen Use-by', () => {
    expect(pantryLeftoverText(frozenChilli(), TODAY)).toEqual({ title: 'Chilli', meta: '3 portions · Use by 10 Feb' })
  })
})
