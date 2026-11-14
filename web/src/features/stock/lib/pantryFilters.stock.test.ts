// Supplies in the Pantry (household-items.md 4.6, 6, 9; H6): the "Food or Supplies" filter, `?stock=food|supply`. Absent = both.
// It is a separate filter from `kind`, which is the Storage Place kind.
import { describe, expect, it } from 'vitest'
import type { StoragePlace } from '../types'
import {
  appliedFilters,
  pantryFilterChips,
  pantryFiltersFromParams,
  stockChoices,
  withStock,
  withoutChip,
  withoutPantryFilters,
} from './pantryFilters'

const p = (q: string) => new URLSearchParams(q)
const places: StoragePlace[] = [{ id: 2, name: 'Garage Freezer', kind: 'freezer', default: false }]

describe('?stock= is read like ?status=', () => {
  it('is "all" when absent', () => {
    expect(pantryFiltersFromParams(p('')).stock).toBe('all')
  })
  it('reads food and supply', () => {
    expect(pantryFiltersFromParams(p('stock=food')).stock).toBe('food')
    expect(pantryFiltersFromParams(p('stock=supply')).stock).toBe('supply')
  })
  it('ignores an unknown value, "all", the plural and a case change; the first value wins over a repeat', () => {
    for (const q of ['stock=all', 'stock=supplies', 'stock=Supply', 'stock=', 'stock=item']) expect(pantryFiltersFromParams(p(q)).stock).toBe('all')
    expect(pantryFiltersFromParams(p('stock=supply&stock=food')).stock).toBe('supply')
  })
  it('does not touch ?kind= (the Storage Place kind)', () => {
    const s = pantryFiltersFromParams(p('stock=supply&kind=freezer'))
    expect(s.stock).toBe('supply')
    expect(s.kinds).toEqual(['freezer'])
    expect(pantryFiltersFromParams(p('kind=supply')).kinds).toEqual([])
    expect(pantryFiltersFromParams(p('kind=supply')).stock).toBe('all')
  })
})

describe('withStock', () => {
  it('sets stock, keeps the other parameters, and "all" removes it', () => {
    expect(withStock(p('view=places&status=useSoon'), 'supply').toString()).toBe('view=places&status=useSoon&stock=supply')
    expect(withStock(p('stock=food&x=1'), 'supply').toString()).toBe('stock=supply&x=1')
    expect(withStock(p('stock=food&x=1'), 'all').toString()).toBe('x=1')
  })
  it('does not mutate its input', () => {
    const q = p('stock=food')
    withStock(q, 'supply')
    expect(q.toString()).toBe('stock=food')
  })
})

describe('withoutChip and withoutPantryFilters', () => {
  it('the "stock" chip removes ?stock= only', () => {
    expect(withoutChip(p('stock=supply&status=useSoon&kind=fridge'), 'stock').toString()).toBe('status=useSoon&kind=fridge')
  })
  it('Clear filters removes ?stock= with the other filters and keeps the list, the sort and the grouping', () => {
    expect(withoutPantryFilters(p('view=places&stock=supply&status=spoiled&sort=name&group=off')).toString()).toBe('view=places&sort=name&group=off')
  })
})

describe('appliedFilters: Food or Supplies applies in both lists', () => {
  const state = pantryFiltersFromParams(p('stock=supply&status=useSoon&place=2&kind=fridge'))
  it('By Storage Place', () => {
    expect(appliedFilters(state, 'places', places).stock).toBe('supply')
  })
  it('By Ingredient (where the Storage Place filters do not apply)', () => {
    expect(appliedFilters(state, 'ingredients', places)).toEqual({ status: 'useSoon', stock: 'supply', places: [], kinds: [], onlyLeftovers: false })
  })
})

describe('pantryFilterChips: one removable chip per value', () => {
  it('Food', () => {
    expect(pantryFilterChips(pantryFiltersFromParams(p('stock=food')), 'places', places)).toEqual([{ key: 'stock', label: 'Food', removeLabel: 'Remove Food', icon: 'ingredients' }])
  })
  it('Supplies (the label is plural, the URL value singular)', () => {
    expect(pantryFilterChips(pantryFiltersFromParams(p('stock=supply')), 'places', places)).toEqual([{ key: 'stock', label: 'Supplies', removeLabel: 'Remove Supplies', icon: 'supply' }])
  })
  it('sits after the status and Leftovers and before the kinds and the Storage Places, the order of the panel', () => {
    const state = pantryFiltersFromParams(p('place=2&kind=freezer&stock=supply&leftovers=1&status=useSoon'))
    expect(pantryFilterChips(state, 'places', places).map((c) => c.key)).toEqual(['status', 'leftovers', 'stock', 'kind:freezer', 'place:2'])
  })
  it('is on By Ingredient too', () => {
    expect(pantryFilterChips(pantryFiltersFromParams(p('stock=supply&place=2')), 'ingredients', places).map((c) => c.key)).toEqual(['stock'])
  })
  it('no stock parameter, no chip', () => {
    expect(pantryFilterChips(pantryFiltersFromParams(p('')), 'places', places)).toEqual([])
  })
})

describe('stockChoices: the section shows only while the Household has a Supply', () => {
  it('Food and Supplies, in that order, while there is a Supply', () => {
    expect(stockChoices(true)).toEqual(['food', 'supply'])
  })
  it('nothing without one', () => {
    expect(stockChoices(false)).toEqual([])
  })
})
