// pantry-filter: the search over the Storage Place list of the Filters panel (docs/design/pantry-filter.md 4.6, 6).
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeLot } from '../testData'
import type { StoragePlace } from '../types'
import { usePlaceFilterSearch } from './usePlaceFilterSearch'

const places: StoragePlace[] = [
  { id: 1, name: 'Kitchen Pantry', kind: 'pantry', default: true },
  { id: 2, name: 'Garage Freezer', kind: 'freezer', default: false },
]
const lots = [makeLot({ id: 1, storagePlaceId: 2 })]

describe('usePlaceFilterSearch', () => {
  it('starts with every row and no empty text', () => {
    const { result } = renderHook(() => usePlaceFilterSearch(places, lots, [2]))
    expect(result.current.query).toBe('')
    expect(result.current.rows.map((r) => [r.name, r.lots, r.selected])).toEqual([
      ['Garage Freezer', 1, true],
      ['Kitchen Pantry', 0, false],
      ['Not sorted', 0, false],
    ])
    expect(result.current.emptyText).toBeNull()
  })
  it('filters as you type, and says when nothing matches', () => {
    const { result } = renderHook(() => usePlaceFilterSearch(places, lots, []))
    act(() => result.current.setQuery('kitchen'))
    expect(result.current.rows.map((r) => r.name)).toEqual(['Kitchen Pantry'])
    act(() => result.current.setQuery('  attic '))
    expect(result.current.rows).toEqual([])
    expect(result.current.emptyText).toBe("No Storage Place matches 'attic'")
  })
})
