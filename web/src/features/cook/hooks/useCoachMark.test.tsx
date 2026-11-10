import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useCoachMark } from './useCoachMark'

beforeEach(() => localStorage.clear())

describe('useCoachMark', () => {
  it('shows the first time, then never again once dismissed', () => {
    const first = renderHook(() => useCoachMark())
    expect(first.result.current[0]).toBe(true)
    act(() => first.result.current[1]())
    expect(first.result.current[0]).toBe(false)
    expect(localStorage.getItem('feeder.cook.coach')).toBe('seen')
    first.unmount()
    expect(renderHook(() => useCoachMark()).result.current[0]).toBe(false)
  })
})
