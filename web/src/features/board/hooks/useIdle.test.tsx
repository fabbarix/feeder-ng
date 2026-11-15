// B9-47 (TB-04): the board's Close control dims after 10 s with no pointer, touch or key input, and returns on any input.
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdle } from './useIdle'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const input = (type: string) => act(() => void window.dispatchEvent(new Event(type, { bubbles: true })))

describe('useIdle', () => {
  it('is false at first and true after 10 s without input (the default)', () => {
    const { result } = renderHook(() => useIdle())
    expect(result.current).toBe(false)
    act(() => void vi.advanceTimersByTime(9_999))
    expect(result.current).toBe(false)
    act(() => void vi.advanceTimersByTime(1))
    expect(result.current).toBe(true)
  })

  it.each(['pointermove', 'pointerdown', 'touchstart', 'keydown'])('%s ends the idle state at once', (type) => {
    const { result } = renderHook(() => useIdle())
    act(() => void vi.advanceTimersByTime(10_000))
    expect(result.current).toBe(true)
    input(type)
    expect(result.current).toBe(false)
  })

  it('input restarts the 10 s: idle again only 10 s after the last input', () => {
    const { result } = renderHook(() => useIdle())
    act(() => void vi.advanceTimersByTime(8_000))
    input('keydown')
    act(() => void vi.advanceTimersByTime(9_000))
    expect(result.current).toBe(false)
    act(() => void vi.advanceTimersByTime(1_000))
    expect(result.current).toBe(true)
  })

  it('takes its own delay', () => {
    const { result } = renderHook(() => useIdle(2_000))
    act(() => void vi.advanceTimersByTime(2_000))
    expect(result.current).toBe(true)
  })

  it('removes its listeners and its timer on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useIdle())
    unmount()
    expect(remove).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
