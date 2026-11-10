import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useConnectivity } from './useConnectivity'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const setOnline = (value: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)

describe('useConnectivity', () => {
  it('is online with no savedAt when the browser is online', () => {
    setOnline(true)
    const { result } = renderHook(() => useConnectivity())
    expect(result.current).toEqual({ offline: false, savedAt: null })
  })

  it('starts offline (savedAt = mount time) when the browser is already offline', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 10, 14, 2) })
    setOnline(false)
    const { result } = renderHook(() => useConnectivity())
    expect(result.current.offline).toBe(true)
    expect(result.current.savedAt).toEqual(new Date(2026, 10, 10, 14, 2))
  })

  it('goes offline on the window offline event, remembering when the connection dropped', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 10, 9, 30) })
    setOnline(true)
    const { result } = renderHook(() => useConnectivity())
    vi.setSystemTime(new Date(2026, 10, 10, 9, 45))
    act(() => {
      setOnline(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current.offline).toBe(true)
    expect(result.current.savedAt).toEqual(new Date(2026, 10, 10, 9, 45))
  })

  it('comes back online on the online event and clears savedAt', () => {
    setOnline(false)
    const { result } = renderHook(() => useConnectivity())
    act(() => {
      setOnline(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toEqual({ offline: false, savedAt: null })
  })

  it('removes its listeners on unmount', () => {
    setOnline(true)
    const remove = vi.spyOn(window, 'removeEventListener')
    renderHook(() => useConnectivity()).unmount()
    expect(remove.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['online', 'offline']))
  })
})
