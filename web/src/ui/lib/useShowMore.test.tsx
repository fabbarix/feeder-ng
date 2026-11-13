// DS-TODAY: the state behind "Show N more" / "Show less": collapsed by default, toggles, collapses again when the list shrinks to fit.
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useShowMore } from './useShowMore'

const rows = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

describe('useShowMore', () => {
  it('starts collapsed: the first 3 rows, "Show 4 more"', () => {
    const { result } = renderHook(() => useShowMore(rows(7), 3))
    expect(result.current.visible).toEqual([1, 2, 3])
    expect(result.current.hidden).toBe(4)
    expect(result.current.expanded).toBe(false)
    expect(result.current.capped).toBe(true)
  })

  it('toggle shows all, toggle again collapses', () => {
    const { result } = renderHook(() => useShowMore(rows(7), 3))
    act(() => result.current.toggle())
    expect(result.current.visible).toHaveLength(7)
    expect(result.current.expanded).toBe(true)
    expect(result.current.hidden).toBe(0)
    act(() => result.current.toggle())
    expect(result.current.visible).toHaveLength(3)
  })

  it('the default cap is 3', () => {
    const { result } = renderHook(() => useShowMore(rows(5)))
    expect(result.current.visible).toHaveLength(3)
  })

  it('when rows are handled (thrown out or kept) down to the cap, it is no longer capped and forgets the expansion', () => {
    const { result, rerender } = renderHook(({ n }) => useShowMore(rows(n), 3), { initialProps: { n: 5 } })
    act(() => result.current.toggle())
    rerender({ n: 3 })
    expect(result.current.capped).toBe(false)
    expect(result.current.expanded).toBe(false)
    rerender({ n: 6 })
    expect(result.current.visible).toHaveLength(3) // a longer list later starts collapsed again
  })
})
