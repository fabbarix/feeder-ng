// pantry-filter: the Pantry's view and filters in the URL, every change replacing the history entry, and the device's list
// (docs/design/pantry-filter.md 2.5, 2.6, 6).
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import type { StoragePlace } from '../types'
import { PANTRY_MODE_KEY, usePantryFilters } from './usePantryFilters'

const places: StoragePlace[] = [
  { id: 1, name: 'Kitchen Pantry', kind: 'pantry', default: true },
  { id: 2, name: 'Garage Freezer', kind: 'freezer', default: false },
]

function setup(url = '/pantry') {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  return renderHook(
    () => {
      const filters = usePantryFilters(places)
      const location = useLocation()
      const navigation = useNavigationType()
      return { filters, search: location.search, navigation }
    },
    { wrapper },
  )
}

beforeEach(() => {
  localStorage.removeItem(PANTRY_MODE_KEY)
})

describe('usePantryFilters', () => {
  it('starts By Storage Place with no filter', () => {
    const { result } = setup()
    expect(result.current.filters).toMatchObject({ mode: 'places', status: 'all', places: [], kinds: [], leftovers: false, sort: 'goodUntil', groupByPlace: true, count: 0, chips: [] })
  })
  it('reads the URL', () => {
    const { result } = setup('/pantry?status=spoiled&place=2&kind=fridge&sort=name&group=off')
    expect(result.current.filters).toMatchObject({ status: 'spoiled', places: [2], kinds: ['fridge'], sort: 'name', groupByPlace: false, count: 3 })
    expect(result.current.filters.applied).toEqual({ status: 'spoiled', stock: 'all', places: [2], kinds: ['fridge'], onlyLeftovers: false })
  })
  it('every setter writes the URL, replacing the history entry, and keeps the rest', () => {
    const { result } = setup('/pantry?x=1')
    act(() => result.current.filters.setStatus('useSoon'))
    expect(result.current.navigation).toBe('REPLACE')
    act(() => result.current.filters.togglePlace(2))
    act(() => result.current.filters.toggleKind('freezer'))
    act(() => result.current.filters.setLeftovers(true))
    act(() => result.current.filters.setSort('quantity'))
    act(() => result.current.filters.setGroupByPlace(false))
    expect(result.current.search).toBe('?x=1&status=useSoon&place=2&kind=freezer&leftovers=1&sort=quantity&group=off')
    expect(result.current.navigation).toBe('REPLACE')
    expect(result.current.filters.count).toBe(4)
  })
  it('choosing the status in force again clears it; choosing the other moves it (no "All")', () => {
    const { result } = setup()
    act(() => result.current.filters.setStatus('useSoon'))
    act(() => result.current.filters.setStatus('spoiled'))
    expect(result.current.filters.status).toBe('spoiled')
    act(() => result.current.filters.setStatus('spoiled'))
    expect(result.current.filters.status).toBe('all')
    expect(result.current.search).toBe('')
  })
  it('remove takes one chip away, clear every filter but keeps the list, the sort and the grouping', () => {
    const { result } = setup('/pantry?view=places&status=useSoon&place=1&place=2&kind=fridge&sort=name&group=off')
    act(() => result.current.filters.remove('place:1'))
    expect(result.current.filters.places).toEqual([2])
    act(() => result.current.filters.clear())
    expect(result.current.search).toBe('?view=places&sort=name&group=off')
    expect(result.current.filters.count).toBe(0)
  })
  it('By Ingredient applies and counts only the status', () => {
    const { result } = setup('/pantry?view=ingredients&status=useSoon&place=2&kind=fridge&leftovers=1')
    expect(result.current.filters.count).toBe(1)
    expect(result.current.filters.chips.map((c) => c.key)).toEqual(['status'])
    expect(result.current.filters.applied).toEqual({ status: 'useSoon', stock: 'all', places: [], kinds: [], onlyLeftovers: false })
  })
})

describe('the list: URL first, then the device', () => {
  it('uses the remembered list when the URL names none', () => {
    localStorage.setItem(PANTRY_MODE_KEY, 'ingredients')
    expect(setup().result.current.filters.mode).toBe('ingredients')
  })
  it('the URL wins over the remembered list', () => {
    localStorage.setItem(PANTRY_MODE_KEY, 'ingredients')
    expect(setup('/pantry?view=places').result.current.filters.mode).toBe('places')
  })
  it('choosing a list writes the URL and the device', () => {
    const { result } = setup()
    act(() => result.current.filters.setMode('ingredients'))
    expect(result.current.search).toBe('?view=ingredients')
    expect(localStorage.getItem(PANTRY_MODE_KEY)).toBe('ingredients')
    expect(result.current.navigation).toBe('REPLACE')
  })
  it('works without storage (blocked or missing)', () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('blocked') } })
    try {
      const { result } = setup()
      expect(result.current.filters.mode).toBe('places')
      act(() => result.current.filters.setMode('ingredients'))
      expect(result.current.filters.mode).toBe('ingredients')
    } finally {
      if (real) Object.defineProperty(globalThis, 'localStorage', real)
    }
  })
})
