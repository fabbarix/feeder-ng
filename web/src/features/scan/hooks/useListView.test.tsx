// SR4 review: the Scanned / To get choice is remembered per device; a scan switches back to Scanned, the stored session
// coming back on load does not.
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { LIST_VIEW_KEY } from '../lib/listView'
import { useListView } from './useListView'

const hook = (count: number | null) => renderHook(({ count }: { count: number | null }) => useListView(count), { initialProps: { count } })

beforeEach(() => localStorage.clear())

describe('useListView', () => {
  it('starts on the remembered choice, and remembers a new one', () => {
    localStorage.setItem(LIST_VIEW_KEY, 'to-get')
    const { result } = hook(0)
    expect(result.current.view).toBe('to-get')
    act(() => result.current.choose('scanned'))
    expect(localStorage.getItem(LIST_VIEW_KEY)).toBe('scanned')
  })

  it('a scan switches back to Scanned', () => {
    localStorage.setItem(LIST_VIEW_KEY, 'to-get')
    const { result, rerender } = hook(2)
    rerender({ count: 3 })
    expect(result.current.view).toBe('scanned')
  })

  it('the stored session loading (null, then its count) keeps To get', () => {
    localStorage.setItem(LIST_VIEW_KEY, 'to-get')
    const { result, rerender } = hook(null)
    rerender({ count: 4 })
    expect(result.current.view).toBe('to-get')
  })
})
