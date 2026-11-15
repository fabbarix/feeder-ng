// B9-29 (SSP-10): Put away a whole shop at once. The pure rules behind the sheet (lib/putAway.ts, no React):
//   unsortedLots(lots)                       the Lots with no Storage Place (storagePlaceId null or absent), in the order given
//   defaultPutAwayPlace(places, lastUsedId)  the Select's first value: the place last used in this sheet while it still exists, else the
//                                            default Storage Place, else the first fridge, else the first place, else null (no places)
//   toggleLot(selected, id)                  a new Set with the id added, or removed when it was in
//   putAwayMoves(lots, selected, placeId)    the request body's `moves`, in the list's order, only for ticked Lots that are in `lots`
//   putAwayTitle(n)                          "Put away 17 Stock Lots" / "Put away 1 Stock Lot"
//   moveLabel(n, placeName)                  "Move 4 to Kitchen Fridge" (the primary's name; it carries the count and the place)
//   afterMove(lots, result)                  the Lots still to put away once a move answered {lots, skipped}: the moved ones and the
//                                            skipped ones (somebody sorted them meanwhile) leave the list
import { describe, expect, it } from 'vitest'
import { makeLot } from '../testData'
import type { StoragePlace } from '../types'
import { afterMove, defaultPutAwayPlace, moveLabel, putAwayMoves, putAwayTitle, toggleLot, unsortedLots } from './putAway'

const place = (id: number, name: string, kind: StoragePlace['kind'], def = false): StoragePlace => ({ id, name, kind, default: def })
const places = [place(1, 'Kitchen Pantry', 'pantry'), place(2, 'Garage Freezer', 'freezer'), place(3, 'Kitchen Fridge', 'fridge'), place(4, 'Drinks Fridge', 'fridge')]

describe('unsortedLots', () => {
  it('keeps the Lots with no Storage Place (null or absent), in the given order', () => {
    const lots = [makeLot({ id: 1, storagePlaceId: 3 }), makeLot({ id: 2, storagePlaceId: null }), makeLot({ id: 3 }), makeLot({ id: 4, storagePlaceId: 1 })]
    expect(unsortedLots(lots).map((l) => l.id)).toEqual([2, 3])
  })
})

describe('defaultPutAwayPlace', () => {
  it('is the place last used in this sheet, while it still exists', () => {
    expect(defaultPutAwayPlace(places, 2)).toBe(2)
    expect(defaultPutAwayPlace(places, 99)).toBe(3)
  })
  it('else the default Storage Place', () => {
    expect(defaultPutAwayPlace([place(1, 'A', 'pantry'), place(2, 'B', 'freezer', true), place(3, 'C', 'fridge')], null)).toBe(2)
  })
  it('else the first fridge, else the first place', () => {
    expect(defaultPutAwayPlace(places, null)).toBe(3)
    expect(defaultPutAwayPlace([place(1, 'A', 'pantry'), place(2, 'B', 'freezer')], null)).toBe(1)
  })
  it('is null when the Household has no Storage Place', () => {
    expect(defaultPutAwayPlace([], null)).toBeNull()
  })
})

describe('toggleLot', () => {
  it('adds and removes an id and never changes the Set it was given', () => {
    const a = new Set<number>([1])
    const b = toggleLot(a, 2)
    expect([...b].sort()).toEqual([1, 2])
    expect([...a]).toEqual([1])
    expect([...toggleLot(b, 1)]).toEqual([2])
  })
})

describe('putAwayMoves', () => {
  const lots = [makeLot({ id: 5 }), makeLot({ id: 6 }), makeLot({ id: 7 })]
  it('has one move per ticked Lot, in the list order, all to the chosen place', () => {
    expect(putAwayMoves(lots, new Set([7, 5]), 3)).toEqual([
      { lotId: 5, storagePlaceId: 3 },
      { lotId: 7, storagePlaceId: 3 },
    ])
  })
  it('leaves out a ticked id that is no longer in the list, and has no moves when nothing is ticked', () => {
    expect(putAwayMoves(lots, new Set([99]), 3)).toEqual([])
    expect(putAwayMoves(lots, new Set(), 3)).toEqual([])
  })
})

describe('the words', () => {
  it('title counts the Stock Lots', () => {
    expect(putAwayTitle(17)).toBe('Put away 17 Stock Lots')
    expect(putAwayTitle(1)).toBe('Put away 1 Stock Lot')
  })
  it('the primary says how many and where', () => {
    expect(moveLabel(4, 'Kitchen Fridge')).toBe('Move 4 to Kitchen Fridge')
    expect(moveLabel(1, 'Garage Freezer')).toBe('Move 1 to Garage Freezer')
  })
})

describe('afterMove', () => {
  const lots = [makeLot({ id: 1 }), makeLot({ id: 2 }), makeLot({ id: 3 }), makeLot({ id: 4 })]
  it('drops the moved Lots and the skipped ones', () => {
    const rest = afterMove(lots, { lots: [makeLot({ id: 1, storagePlaceId: 3 }), makeLot({ id: 2, storagePlaceId: 3 })], skipped: [3] })
    expect(rest.map((l) => l.id)).toEqual([4])
  })
  it('an empty answer changes nothing', () => {
    expect(afterMove(lots, { lots: [], skipped: [] })).toHaveLength(4)
  })
})
