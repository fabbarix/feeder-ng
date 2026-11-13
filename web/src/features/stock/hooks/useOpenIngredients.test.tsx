import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OPEN_INGREDIENTS_KEY, useOpenIngredients } from './useOpenIngredients'

beforeEach(() => {
  try {
    sessionStorage.removeItem(OPEN_INGREDIENTS_KEY)
  } catch {
    // no storage in this environment
  }
})
afterEach(() => vi.unstubAllGlobals())

describe('useOpenIngredients', () => {
  it('starts with every row closed and toggles one open and closed', () => {
    const { result } = renderHook(() => useOpenIngredients())
    expect(result.current.isOpen(7)).toBe(false)
    act(() => result.current.toggle(7))
    expect(result.current.isOpen(7)).toBe(true)
    expect(result.current.isOpen(8)).toBe(false)
    act(() => result.current.toggle(7))
    expect(result.current.isOpen(7)).toBe(false)
  })

  it('remembers the open rows for the session: a remount finds them open', () => {
    const first = renderHook(() => useOpenIngredients())
    act(() => first.result.current.toggle(7))
    act(() => first.result.current.toggle(9))
    first.unmount()
    const second = renderHook(() => useOpenIngredients())
    expect(second.result.current.isOpen(7)).toBe(true)
    expect(second.result.current.isOpen(9)).toBe(true)
    expect(JSON.parse(sessionStorage.getItem(OPEN_INGREDIENTS_KEY) ?? 'null')).toEqual(expect.arrayContaining([7, 9]))
  })

  it('does not use localStorage: the device does not keep it beyond the session', () => {
    const { result } = renderHook(() => useOpenIngredients())
    act(() => result.current.toggle(7))
    expect(Object.keys(localStorage).filter((k) => k.includes('open'))).toEqual([])
  })

  it('ignores a damaged stored value', () => {
    sessionStorage.setItem(OPEN_INGREDIENTS_KEY, '{not json')
    const { result } = renderHook(() => useOpenIngredients())
    expect(result.current.isOpen(7)).toBe(false)
    act(() => result.current.toggle(7))
    expect(result.current.isOpen(7)).toBe(true)
  })

  it('still works for this visit when storage throws', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    const { result } = renderHook(() => useOpenIngredients())
    expect(result.current.isOpen(7)).toBe(false)
    act(() => result.current.toggle(7))
    expect(result.current.isOpen(7)).toBe(true)
  })
})
