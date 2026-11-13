// Round 2: the Pantry's Use soon / Spoiled filters for Leftovers follow the Stock Lot rule, and the sections put Lots and Leftovers together.
import { describe, expect, it } from 'vitest'
import { frozenChilli, TODAY } from '../../../lib/leftovers/fixtures'
import { makeLot } from '../testData'
import type { StoragePlace } from '../types'
import type { PantryGroup } from './pantry'
import { pantrySections, statusLeftovers } from './pantryLeftovers'

// Today is 2026-11-12. Use soon = Use-by from today up to today + 3 days (stock.UseSoonDays), not past; Spoiled = to answer.
const l = (id: number, useBy: string, over = {}) => frozenChilli({ id, recipeName: `R${id}`, useBy, ...over })
const set = [
  l(1, '2026-11-10', { toAnswer: true }), // past: to answer
  l(2, '2026-11-12'), // today
  l(3, '2026-11-15'), // today + 3
  l(4, '2026-11-16'), // today + 4
  l(5, '2027-02-10'),
]

describe('statusLeftovers', () => {
  it('all keeps every Leftover', () => {
    expect(statusLeftovers(set, 'all', TODAY)).toHaveLength(5)
  })
  it('Use soon: not past, Use-by within 3 days (today and today + 3 count)', () => {
    expect(statusLeftovers(set, 'useSoon', TODAY).map((x) => x.id)).toEqual([2, 3])
  })
  it('Use soon never includes one that is to answer', () => {
    expect(statusLeftovers([l(1, '2026-11-12', { toAnswer: true })], 'useSoon', TODAY)).toEqual([])
  })
  it('Spoiled means to answer', () => {
    expect(statusLeftovers(set, 'spoiled', TODAY).map((x) => x.id)).toEqual([1])
  })
  it('does no day maths before the Household date is known (empty today): Use soon is empty, never NaN-driven', () => {
    expect(statusLeftovers(set, 'useSoon', '')).toEqual([])
    expect(statusLeftovers(set, 'spoiled', '').map((x) => x.id)).toEqual([1])
  })
})

const place = (id: number, name: string, kind: StoragePlace['kind'] = 'freezer'): StoragePlace => ({ id, name, kind, default: false }) as StoragePlace
const places = [place(1, 'Kitchen Pantry', 'pantry'), place(2, 'Garage Freezer'), place(4, 'Basement Freezer')]
const group = (p: StoragePlace | null, key: number, ids: number[]): PantryGroup => ({ place: p, key, lots: ids.map((id) => makeLot({ id })) })

describe('pantrySections', () => {
  it('puts each place\'s Lots and Leftovers in one section, by name, Not sorted last', () => {
    const sections = pantrySections(
      [group(places[1]!, 2, [10]), group(places[0]!, 1, [11]), group(null, 0, [12])],
      [frozenChilli({ id: 5, storagePlaceId: 2 }), frozenChilli({ id: 6, storagePlaceId: 99, storagePlaceName: null })],
      places,
      true,
    )
    expect(sections.map((s) => [s.name, s.lots.length, s.leftovers.map((x) => x.id)])).toEqual([
      ['Garage Freezer', 1, [5]],
      ['Kitchen Pantry', 1, []],
      ['Not sorted', 1, [6]],
    ])
  })
  it('a Freezer with only a Leftover still gets a section; an empty place gets none', () => {
    const sections = pantrySections([group(places[0]!, 1, [])], [frozenChilli({ id: 7, storagePlaceId: 4 })], places, true)
    expect(sections.map((s) => s.name)).toEqual(['Basement Freezer'])
  })
  it('Leftovers whose Freezer is gone join the Not sorted Lots', () => {
    const sections = pantrySections([group(null, 0, [12])], [frozenChilli({ id: 6, storagePlaceId: null, storagePlaceName: null })], places, true)
    expect(sections).toHaveLength(1)
    expect(sections[0]).toMatchObject({ name: 'Not sorted' })
    expect(sections[0]!.lots).toHaveLength(1)
    expect(sections[0]!.leftovers).toHaveLength(1)
  })
  it('ungrouped, one section (key -1) with the Lots and then the Leftovers', () => {
    const sections = pantrySections([group(null, -1, [10, 11])], [frozenChilli({ id: 5 })], places, false)
    expect(sections).toHaveLength(1)
    expect(sections[0]).toMatchObject({ key: -1 })
    expect(sections[0]!.lots).toHaveLength(2)
    expect(sections[0]!.leftovers).toHaveLength(1)
  })
  it('nothing at all is no section', () => {
    expect(pantrySections([], [], places, true)).toEqual([])
    expect(pantrySections([], [], places, false)).toEqual([])
  })
})
