// B9-39 (TB-01): Today must show the hero moving on AT the slot time without a reload. `useHeroClock(nextChange)` returns the current time and re-renders
// when the clock reaches the instant `nextChange(now)` names (ms since the epoch; null = nothing to wait for), the start time or the slot time of
// the hero. It also looks again when the page becomes visible (a phone that slept past the slot time) and, at the latest, every minute.
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { movedToConfirm } from '../lib/hero'
import { useHeroClock } from './useHeroClock'

const T0 = Date.parse('2026-11-10T12:59:30Z')
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})
afterEach(() => vi.useRealTimers())

describe('useHeroClock', () => {
  it('returns the current time', () => {
    const { result } = renderHook(() => useHeroClock(() => null))
    expect(result.current.getTime()).toBe(T0)
  })

  it('re-renders at the instant the callback names, not before', () => {
    const slotTime = Date.parse('2026-11-10T13:00:00Z')
    const renders: number[] = []
    const { result } = renderHook(() => {
      const now = useHeroClock((n) => (n.getTime() < slotTime ? slotTime : null))
      renders.push(now.getTime())
      return now
    })
    act(() => void vi.advanceTimersByTime(29_000))
    expect(result.current.getTime()).toBe(T0)
    act(() => void vi.advanceTimersByTime(1_500))
    expect(result.current.getTime()).toBeGreaterThanOrEqual(slotTime)
  })

  it('asks again with the new time, so a start time and then a slot time are both waited for', () => {
    const start = Date.parse('2026-11-10T13:00:00Z')
    const slotTime = Date.parse('2026-11-10T13:05:00Z')
    const { result } = renderHook(() => useHeroClock((n) => (n.getTime() < start ? start : n.getTime() < slotTime ? slotTime : null)))
    act(() => void vi.advanceTimersByTime(31_000))
    expect(result.current.getTime()).toBeGreaterThanOrEqual(start)
    act(() => void vi.advanceTimersByTime(5 * 60_000))
    expect(result.current.getTime()).toBeGreaterThanOrEqual(slotTime)
  })

  it('with nothing to wait for it still looks again every minute (the clock may have been changed)', () => {
    const { result } = renderHook(() => useHeroClock(() => null))
    act(() => void vi.advanceTimersByTime(61_000))
    expect(result.current.getTime()).toBeGreaterThanOrEqual(T0 + 60_000)
  })

  it('looks again when the page becomes visible', () => {
    const { result } = renderHook(() => useHeroClock(() => null))
    vi.setSystemTime(T0 + 3 * 3600_000)
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    expect(result.current.getTime()).toBe(T0 + 3 * 3600_000)
  })

  it('leaves no timer behind on unmount', () => {
    const { unmount } = renderHook(() => useHeroClock((n) => n.getTime() + 10_000))
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

// "Lunch moved to To confirm." (a polite live region on Today): which slot names have newly joined the just-served rows since the last render.
describe('movedToConfirm', () => {
  const e = (date: string, id: number, name: string) => ({ date, mealSlotId: id, name })
  it('names the slot that is new, by its Meal Slot name', () => {
    expect(movedToConfirm([e('2026-11-10', 1, 'Breakfast')], [e('2026-11-10', 1, 'Breakfast'), e('2026-11-10', 2, 'Lunch')])).toBe('Lunch moved to To confirm.')
  })

  it('nothing new: an empty message (and the very first render has no "before", so it says nothing)', () => {
    expect(movedToConfirm([e('2026-11-10', 1, 'Breakfast')], [e('2026-11-10', 1, 'Breakfast')])).toBe('')
    expect(movedToConfirm(null, [e('2026-11-10', 1, 'Breakfast')])).toBe('')
  })

  it('several at once are joined: "Breakfast and Lunch moved to To confirm."', () => {
    expect(movedToConfirm([], [e('2026-11-10', 1, 'Breakfast'), e('2026-11-10', 2, 'Lunch')])).toBe('Breakfast and Lunch moved to To confirm.')
  })

  it('a row that leaves says nothing, and two Courses of one slot are one name', () => {
    expect(movedToConfirm([e('2026-11-10', 1, 'Breakfast')], [])).toBe('')
    expect(movedToConfirm([], [e('2026-11-10', 2, 'Lunch'), e('2026-11-10', 2, 'Lunch')])).toBe('Lunch moved to To confirm.')
  })
})
