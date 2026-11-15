// B9-43 (SSP-09): how many of this list's Stock Lots are still Not sorted: the Not sorted Lots (storagePlaceId null) bought today (the list's
// Household date) of an Ingredient the list has ticked (a ticked Line, or a ticked Ingredient extra); a Stock-take's Lots are not the list's.
// The list JSON carries no Lot ids (B9-23), so the count is by Ingredient and day (a choice, listed in the hand-back).
import { describe, expect, it } from 'vitest'
import { makeLot } from '../../stock/testData'
import { makeExtra, makeGarlic, makeLine, makeList, makeTick } from '../testData'
import { unsortedFromList } from './unsorted'

const done = makeList({
  today: '2026-11-15',
  lines: [makeGarlic({ ticked: true, quantity: 0, tick: makeTick() }), makeLine({ ingredientId: 2, ticked: true, quantity: 0 }), makeLine({ ingredientId: 3 })],
  extras: [makeExtra({ id: 4, text: null, ingredientId: 8, name: 'milk', baseUnit: 'ml', quantity: 1000, ticked: true })],
  complete: true,
})
const lot = (ingredientId: number, over = {}) => makeLot({ id: ingredientId * 10, ingredientId, purchased: '2026-11-15', storagePlaceId: null, source: 'scan', ...over })

describe('unsortedFromList', () => {
  it('counts the Not sorted Lots of ticked Lines and ticked Ingredient extras, bought today', () => {
    expect(unsortedFromList([lot(9), lot(2), lot(8)], done)).toBe(3)
  })

  it('a Lot already put in a Storage Place is sorted, not counted', () => {
    expect(unsortedFromList([lot(9, { storagePlaceId: 4 }), lot(2)], done)).toBe(1)
  })

  it('a Lot with no storagePlaceId at all (an older fixture) is not claimed as unsorted', () => {
    const old = makeLot({ id: 90, ingredientId: 9, purchased: '2026-11-15', source: 'scan' })
    delete (old as { storagePlaceId?: unknown }).storagePlaceId
    expect(unsortedFromList([old], done)).toBe(0)
  })

  it('a Lot of an Ingredient the list did not tick (an open Line, or none on the list) is not counted', () => {
    expect(unsortedFromList([lot(3), lot(77)], done)).toBe(0)
  })

  it('a Lot bought another day is not counted', () => {
    expect(unsortedFromList([lot(9, { purchased: '2026-11-14' })], done)).toBe(0)
  })

  it('a Stock-take\'s Lot is not the list\'s (a tick adds "scan" or "manual" Lots)', () => {
    expect(unsortedFromList([lot(9, { source: 'stock_take' }), lot(2, { source: 'manual' })], done)).toBe(1)
  })

  it('no Lots: 0', () => {
    expect(unsortedFromList([], done)).toBe(0)
  })
})
