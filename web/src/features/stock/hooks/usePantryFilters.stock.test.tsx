// Supplies in the Pantry (household-items.md 4.6; H6): ?stock=food|supply through usePantryFilters.
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import type { StoragePlace } from '../types'
import { PANTRY_MODE_KEY, usePantryFilters } from './usePantryFilters'

const places: StoragePlace[] = [{ id: 2, name: 'Garage Freezer', kind: 'freezer', default: false }]

function setup(url = '/pantry') {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  return renderHook(
    () => {
      const filters = usePantryFilters(places)
      return { filters, search: useLocation().search, navigation: useNavigationType() }
    },
    { wrapper },
  )
}

beforeEach(() => localStorage.removeItem(PANTRY_MODE_KEY))

describe('usePantryFilters: Food or Supplies', () => {
  it('both kinds with no parameter', () => {
    const { result } = setup()
    expect(result.current.filters.stock).toBe('all')
    expect(result.current.filters.applied.stock).toBe('all')
    expect(result.current.filters.count).toBe(0)
  })
  it('reads ?stock=supply: it applies, is one chip, and counts', () => {
    const { result } = setup('/pantry?stock=supply')
    expect(result.current.filters.stock).toBe('supply')
    expect(result.current.filters.applied.stock).toBe('supply')
    expect(result.current.filters.chips).toEqual([{ key: 'stock', label: 'Supplies', removeLabel: 'Remove Supplies', icon: 'supply' }])
    expect(result.current.filters.count).toBe(1)
  })
  it('the count includes it beside the other filters', () => {
    const { result } = setup('/pantry?stock=food&status=useSoon&kind=freezer&place=2')
    expect(result.current.filters.count).toBe(4)
  })
  it('it counts on By Ingredient too, where the Storage Place filters do not', () => {
    const { result } = setup('/pantry?view=ingredients&stock=food&status=spoiled&place=2')
    expect(result.current.filters.chips.map((c) => c.key)).toEqual(['status', 'stock'])
    expect(result.current.filters.count).toBe(2)
  })
  it('setStock writes the URL, replacing the history entry, and keeps the rest', () => {
    const { result } = setup('/pantry?x=1')
    act(() => result.current.filters.setStock('supply'))
    expect(result.current.search).toBe('?x=1&stock=supply')
    expect(result.current.navigation).toBe('REPLACE')
  })
  it('choosing the value in force again clears it; choosing the other moves it (one choice, no "All")', () => {
    const { result } = setup()
    act(() => result.current.filters.setStock('supply'))
    act(() => result.current.filters.setStock('food'))
    expect(result.current.filters.stock).toBe('food')
    act(() => result.current.filters.setStock('food'))
    expect(result.current.filters.stock).toBe('all')
    expect(result.current.search).toBe('')
  })
  it('remove("stock") takes it away alone; clear takes it away with the other filters', () => {
    const { result } = setup('/pantry?view=places&stock=supply&status=useSoon&sort=name')
    act(() => result.current.filters.remove('stock'))
    expect(result.current.search).toBe('?view=places&status=useSoon&sort=name')
    act(() => result.current.filters.setStock('food'))
    act(() => result.current.filters.clear())
    expect(result.current.search).toBe('?view=places&sort=name')
  })
})
