// pantry-filter: the Pantry's view and filters in the URL, the filters that apply, the chips and the Storage Place rows
// (docs/design/pantry-filter.md 4, 6).
import { describe, expect, it } from 'vitest'
import { makeLot } from '../testData'
import type { StoragePlace } from '../types'
import { UNSORTED } from './pantry'
import {
  appliedFilters,
  pantryFilterChips,
  pantryFiltersFromParams,
  placeFilterRows,
  withGroupByPlace,
  withKindToggled,
  withLeftovers,
  withMode,
  withPlaceToggled,
  withSort,
  withStatus,
  withoutChip,
  withoutPantryFilters,
} from './pantryFilters'

const p = (q: string) => new URLSearchParams(q)
const places: StoragePlace[] = [
  { id: 1, name: 'Kitchen Pantry', kind: 'pantry', default: true },
  { id: 2, name: 'Garage Freezer', kind: 'freezer', default: false },
  { id: 3, name: 'garage Fridge', kind: 'fridge', default: false },
  { id: 10, name: 'Crème cellar 10', kind: 'pantry', default: false },
  { id: 9, name: 'Crème cellar 9', kind: 'pantry', default: false },
]

describe('pantryFiltersFromParams', () => {
  it('is the defaults with no parameter', () => {
    expect(pantryFiltersFromParams(p(''))).toEqual({ mode: null, status: 'all', places: [], kinds: [], leftovers: false, sort: 'goodUntil', groupByPlace: true })
  })
  it('reads every parameter', () => {
    const s = pantryFiltersFromParams(p('view=ingredients&status=spoiled&place=2&place=none&kind=fridge&kind=freezer&leftovers=1&sort=name&group=off'))
    expect(s).toEqual({ mode: 'ingredients', status: 'spoiled', places: [2, UNSORTED], kinds: ['fridge', 'freezer'], leftovers: true, sort: 'name', groupByPlace: false })
  })
  it('ignores unknown values and repeats', () => {
    const s = pantryFiltersFromParams(p('view=grid&status=all&place=0&place=-1&place=x&place=2&place=2&kind=garage&kind=fridge&kind=fridge&leftovers=yes&sort=price&group=no'))
    expect(s).toEqual({ mode: null, status: 'all', places: [2], kinds: ['fridge'], leftovers: false, sort: 'goodUntil', groupByPlace: true })
  })
})

describe('the URL writers keep every other parameter', () => {
  it('withMode sets view', () => {
    expect(withMode(p('status=useSoon'), 'ingredients').toString()).toBe('status=useSoon&view=ingredients')
    expect(withMode(p('view=ingredients'), 'places').get('view')).toBe('places')
  })
  it('withStatus sets status, and "all" removes it', () => {
    expect(withStatus(p('view=places'), 'useSoon').toString()).toBe('view=places&status=useSoon')
    expect(withStatus(p('status=useSoon&q=1'), 'all').toString()).toBe('q=1')
  })
  it('withPlaceToggled adds a place at the end and removes it again; Not sorted is "none"', () => {
    const one = withPlaceToggled(p('sort=name'), 2)
    expect(one.toString()).toBe('sort=name&place=2')
    const two = withPlaceToggled(one, UNSORTED)
    expect(two.getAll('place')).toEqual(['2', 'none'])
    expect(withPlaceToggled(two, 2).getAll('place')).toEqual(['none'])
    expect(withPlaceToggled(withPlaceToggled(two, 2), UNSORTED).has('place')).toBe(false)
  })
  it('withKindToggled adds and removes a kind', () => {
    const k = withKindToggled(withKindToggled(p(''), 'fridge'), 'freezer')
    expect(k.getAll('kind')).toEqual(['fridge', 'freezer'])
    expect(withKindToggled(k, 'fridge').getAll('kind')).toEqual(['freezer'])
  })
  it('withLeftovers, withSort and withGroupByPlace write only what is not the default', () => {
    expect(withLeftovers(p(''), true).toString()).toBe('leftovers=1')
    expect(withLeftovers(p('leftovers=1'), false).toString()).toBe('')
    expect(withSort(p(''), 'quantity').toString()).toBe('sort=quantity')
    expect(withSort(p('sort=name'), 'goodUntil').toString()).toBe('')
    expect(withGroupByPlace(p(''), false).toString()).toBe('group=off')
    expect(withGroupByPlace(p('group=off'), true).toString()).toBe('')
  })
  it('withoutPantryFilters removes the filters and keeps the list, the sort, the grouping and the rest', () => {
    const q = p('view=places&status=useSoon&place=2&place=none&kind=fridge&leftovers=1&sort=name&group=off&x=1')
    expect(withoutPantryFilters(q).toString()).toBe('view=places&sort=name&group=off&x=1')
  })
  it('withoutChip removes the filter of one chip only', () => {
    const q = p('status=spoiled&place=2&place=3&kind=fridge&leftovers=1')
    expect(withoutChip(q, 'status').has('status')).toBe(false)
    expect(withoutChip(q, 'leftovers').has('leftovers')).toBe(false)
    expect(withoutChip(q, 'kind:fridge').has('kind')).toBe(false)
    expect(withoutChip(q, 'place:3').getAll('place')).toEqual(['2'])
    expect(withoutChip(q, 'place:7').getAll('place')).toEqual(['2', '3'])
  })
})

describe('appliedFilters', () => {
  const state = pantryFiltersFromParams(p('status=useSoon&place=2&place=77&place=none&kind=fridge&leftovers=1'))
  it('By Storage Place: every filter, an unknown Storage Place left out', () => {
    expect(appliedFilters(state, 'places', places)).toEqual({ status: 'useSoon', places: [2, UNSORTED], kinds: ['fridge'], onlyLeftovers: true })
  })
  it('By Ingredient: only the status', () => {
    expect(appliedFilters(state, 'ingredients', places)).toEqual({ status: 'useSoon', places: [], kinds: [], onlyLeftovers: false })
  })
  it('while the Storage Places load, only Not sorted applies', () => {
    expect(appliedFilters(state, 'places', []).places).toEqual([UNSORTED])
  })
})

describe('pantryFilterChips', () => {
  it('no filter, no chip', () => {
    expect(pantryFilterChips(pantryFiltersFromParams(p('view=places&sort=name&group=off')), 'places', places)).toEqual([])
  })
  it('status, Leftovers, kinds, then the Storage Places by name and Not sorted last, in their status colours', () => {
    const state = pantryFiltersFromParams(p('place=none&place=1&place=2&kind=freezer&kind=pantry&leftovers=1&status=useSoon'))
    expect(pantryFilterChips(state, 'places', places)).toEqual([
      { key: 'status', label: 'Use soon', removeLabel: 'Remove Use soon', status: 'spoil' },
      { key: 'leftovers', label: 'Leftovers', removeLabel: 'Remove Leftovers', status: 'leftover' },
      { key: 'kind:pantry', label: 'Pantry', removeLabel: 'Remove kind: Pantry', icon: 'stock' },
      { key: 'kind:freezer', label: 'Freezer', removeLabel: 'Remove kind: Freezer', icon: 'freezer' },
      { key: 'place:2', label: 'Garage Freezer', removeLabel: 'Remove Storage Place: Garage Freezer' },
      { key: 'place:1', label: 'Kitchen Pantry', removeLabel: 'Remove Storage Place: Kitchen Pantry' },
      { key: 'place:0', label: 'Not sorted', removeLabel: 'Remove Storage Place: Not sorted' },
    ])
  })
  it('Spoiled is a danger chip', () => {
    expect(pantryFilterChips(pantryFiltersFromParams(p('status=spoiled')), 'places', places)).toEqual([
      { key: 'status', label: 'Spoiled', removeLabel: 'Remove Spoiled', status: 'danger' },
    ])
  })
  it('By Ingredient shows only the status chip; an unknown Storage Place has none', () => {
    const state = pantryFiltersFromParams(p('status=useSoon&place=2&kind=fridge&leftovers=1'))
    expect(pantryFilterChips(state, 'ingredients', places).map((c) => c.key)).toEqual(['status'])
    expect(pantryFilterChips(pantryFiltersFromParams(p('place=77')), 'places', places)).toEqual([])
  })
  it('uses GLOSSARY words only', () => {
    const state = pantryFiltersFromParams(p('status=useSoon&place=2&kind=fridge&leftovers=1&place=none'))
    for (const c of pantryFilterChips(state, 'places', places)) expect(`${c.label} ${c.removeLabel}`).not.toMatch(/inventory|location|expir|item|batch/i)
  })
})

describe('placeFilterRows', () => {
  const lots = [
    makeLot({ id: 1, storagePlaceId: 2 }),
    makeLot({ id: 2, storagePlaceId: 2 }),
    makeLot({ id: 3, storagePlaceId: 1 }),
    makeLot({ id: 4, storagePlaceId: null }),
    makeLot({ id: 5, storagePlaceId: 99 }),
  ]
  it('every Storage Place by name (accents and case ignored, numbers in order), then Not sorted, with its Lot count', () => {
    const rows = placeFilterRows(places, lots, [], '')
    expect(rows.map((r) => [r.name, r.lots])).toEqual([
      ['Crème cellar 9', 0],
      ['Crème cellar 10', 0],
      ['Garage Freezer', 2],
      ['garage Fridge', 0],
      ['Kitchen Pantry', 1],
      ['Not sorted', 2],
    ])
    expect(rows.at(-1)).toMatchObject({ id: UNSORTED, kind: null })
    expect(rows.find((r) => r.id === 2)?.kind).toBe('freezer')
  })
  it('marks the selected rows and keeps their place in the order', () => {
    const rows = placeFilterRows(places, lots, [1, UNSORTED], '')
    expect(rows.filter((r) => r.selected).map((r) => r.name)).toEqual(['Kitchen Pantry', 'Not sorted'])
    expect(rows.map((r) => r.id)).toEqual(placeFilterRows(places, lots, [], '').map((r) => r.id))
  })
  it('searches accent- and case-blind, every word', () => {
    expect(placeFilterRows(places, lots, [], 'creme 9').map((r) => r.name)).toEqual(['Crème cellar 9'])
    expect(placeFilterRows(places, lots, [], 'GARAGE').map((r) => r.name)).toEqual(['Garage Freezer', 'garage Fridge'])
    expect(placeFilterRows(places, lots, [], 'sorted').map((r) => r.name)).toEqual(['Not sorted'])
    expect(placeFilterRows(places, lots, [], 'zzz')).toEqual([])
  })
})
