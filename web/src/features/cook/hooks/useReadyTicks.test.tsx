// B9-45 (PC-05): ticks on the Get ready list are local to the device (localStorage, per cook scope) and change no Stock.
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '../../plan/test-utils'
import { useReadyTicks } from './useReadyTicks'

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('useReadyTicks', () => {
  it('starts with nothing ticked, ticks and unticks a row', () => {
    const { result } = renderHook(() => useReadyTicks('meal:2026-11-09/2/1'))
    expect([...result.current.ticked]).toEqual([])
    act(() => result.current.toggle('1:0'))
    expect(result.current.ticked.has('1:0')).toBe(true)
    act(() => result.current.toggle('1:0'))
    expect(result.current.ticked.has('1:0')).toBe(false)
  })

  it('keeps the ticks on this device: another mount of the same scope reads them (the sheet and the tile share them)', () => {
    const first = renderHook(() => useReadyTicks('meal:2026-11-09/2/1'))
    act(() => first.result.current.toggle('1:0'))
    expect(localStorage.getItem('feeder.cook.ready.meal:2026-11-09/2/1')).toBe(JSON.stringify(['1:0']))
    const second = renderHook(() => useReadyTicks('meal:2026-11-09/2/1'))
    expect(second.result.current.ticked.has('1:0')).toBe(true)
  })

  it('keeps scopes apart', () => {
    const a = renderHook(() => useReadyTicks('recipe:7'))
    act(() => a.result.current.toggle('x'))
    const b = renderHook(() => useReadyTicks('recipe:8'))
    expect(b.result.current.ticked.has('x')).toBe(false)
  })

  it('clear forgets every tick of the scope', () => {
    const { result } = renderHook(() => useReadyTicks('recipe:7'))
    act(() => result.current.toggle('a'))
    act(() => result.current.toggle('b'))
    act(() => result.current.clear())
    expect([...result.current.ticked]).toEqual([])
    expect(localStorage.getItem('feeder.cook.ready.recipe:7')).toBeNull()
  })

  it('reads nothing from a corrupt value', () => {
    localStorage.setItem('feeder.cook.ready.recipe:7', '{not json')
    const { result } = renderHook(() => useReadyTicks('recipe:7'))
    expect([...result.current.ticked]).toEqual([])
  })

  it('works in memory when storage is blocked (no throw)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useReadyTicks('recipe:7'))
    expect(() => act(() => result.current.toggle('a'))).not.toThrow()
    expect(result.current.ticked.has('a')).toBe(true)
    vi.restoreAllMocks()
  })

  it('never calls the API: ticking changes no Stock', () => {
    const api = mockApi({})
    const { result } = renderHook(() => useReadyTicks('recipe:7'))
    act(() => result.current.toggle('a'))
    expect(api.calls).toHaveLength(0)
  })
})
