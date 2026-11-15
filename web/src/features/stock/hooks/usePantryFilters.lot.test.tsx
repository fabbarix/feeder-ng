// B9-44 (TB-11; TB-14 uses it too): the Pantry opens a Lot's sheet on arrival from `?lot=<id>`. The filters hook reads it as `lot` (a positive
// whole id, else null) and `clearLot()` removes it from the address (replacing the history entry). It is not a filter: no chip, no count.
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { usePantryFilters } from './usePantryFilters'

function setup(url: string) {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  return renderHook(() => ({ filters: usePantryFilters([]), search: useLocation().search }), { wrapper })
}

describe('usePantryFilters: ?lot=', () => {
  it('is null without the parameter', () => {
    expect(setup('/pantry').result.current.filters.lot).toBeNull()
  })
  it('reads a positive whole id', () => {
    expect(setup('/pantry?lot=12').result.current.filters.lot).toBe(12)
  })
  it.each(['abc', '0', '-3', '1.5', ''])('reads %j as no Lot', (v) => {
    expect(setup(`/pantry?lot=${v}`).result.current.filters.lot).toBeNull()
  })
  it('is not a filter: no chip, no count, and the other filters still read', () => {
    const { result } = setup('/pantry?lot=12&status=spoiled')
    expect(result.current.filters.count).toBe(1)
    expect(result.current.filters.chips).toHaveLength(1)
  })
  it('clearLot removes only the lot parameter', () => {
    const { result } = setup('/pantry?lot=12&status=spoiled')
    act(() => result.current.filters.clearLot())
    expect(result.current.search).toBe('?status=spoiled')
    expect(result.current.filters.lot).toBeNull()
  })
})
