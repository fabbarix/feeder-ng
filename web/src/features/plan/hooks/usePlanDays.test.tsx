// ds-plan: the week of day tiles comes from a hook, with no column count and no container measuring.
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { slot } from '../test-utils'
import { usePlanDays } from './usePlanDays'

const slots = ['2026-11-11', '2026-11-09', '2026-11-10'].map((date) => slot({ date }))

describe('usePlanDays', () => {
  it('groups by day in date order, with the heading of each', () => {
    const { result } = renderHook(() => usePlanDays(slots, '2026-11-09'))
    expect(result.current.days.map((d) => d.heading)).toEqual(['Mon 9 · Today', 'Tue 10 · Tomorrow', 'Wed 11'])
  })

  it('says the date range of the week, or nothing without days', () => {
    expect(renderHook(() => usePlanDays(slots, '2026-11-09')).result.current.range).toBe('9 – 11 Nov')
    expect(renderHook(() => usePlanDays([], '2026-11-09')).result.current.range).toBeUndefined()
  })

  it('keeps the same days while its inputs are the same (no re-grouping on every render)', () => {
    const { result, rerender } = renderHook(() => usePlanDays(slots, '2026-11-09'))
    const first = result.current.days
    rerender()
    expect(result.current.days).toBe(first)
  })
})
