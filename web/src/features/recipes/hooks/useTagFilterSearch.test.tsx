// hf-recipes-filter: the Tag list's search inside the Filters panel (docs/design/recipes-filter.md 5.3, 5.5, 6).
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTagFilterSearch } from './useTagFilterSearch'

const known = Array.from({ length: 30 }, (_, i) => ({ name: `Tag ${i + 1}`, recipes: i }))
  .concat([{ name: 'fish', recipes: 3 }, { name: 'Fishcakes', recipes: 1 }])

describe('useTagFilterSearch', () => {
  it('starts with an empty query and every Tag, the selected one first', () => {
    const { result } = renderHook(() => useTagFilterSearch(known, ['Tag 20']))
    expect(result.current.query).toBe('')
    expect(result.current.rows).toHaveLength(32)
    expect(result.current.rows[0]).toMatchObject({ name: 'Tag 20', selected: true })
    expect(result.current.emptyText).toBeNull()
  })
  it('b8: lists every selected Tag first and marks each', () => {
    const { result } = renderHook(() => useTagFilterSearch(known, ['fish', 'Tag 7']))
    expect(result.current.rows.slice(0, 2)).toMatchObject([{ name: 'fish', selected: true }, { name: 'Tag 7', selected: true }])
    expect(result.current.rows.filter((r) => r.selected)).toHaveLength(2)
  })
  it('narrows the rows as the query changes', () => {
    const { result } = renderHook(() => useTagFilterSearch(known, []))
    act(() => result.current.setQuery('FISH'))
    expect(result.current.rows.map((r) => r.name)).toEqual(['fish', 'Fishcakes'])
  })
  it('says nothing matches, quoting the trimmed query', () => {
    const { result } = renderHook(() => useTagFilterSearch(known, []))
    act(() => result.current.setQuery('  zzz '))
    expect(result.current.rows).toEqual([])
    expect(result.current.emptyText).toBe("No Tag matches 'zzz'")
  })
  it('says there is no Tag to choose from when the household has none', () => {
    const { result } = renderHook(() => useTagFilterSearch([], []))
    expect(result.current.emptyText).toBe('No Tag to choose from')
  })
  it('passes each Tag\'s colour through', () => {
    const { result } = renderHook(() => useTagFilterSearch(known, [], (n) => (n === 'fish' ? 'teal' : undefined)))
    act(() => result.current.setQuery('fish'))
    expect(result.current.rows[0]).toMatchObject({ name: 'fish', colour: 'teal' })
  })
})
