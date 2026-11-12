import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { UsedFromNeed } from '../lib/usedFrom'
import { useUsedFrom, type UsedFromCourseInput } from './useUsedFrom'

const lot = (id: number, quantity: number, place = 'Fridge') => ({ id, quantity, purchased: '2026-11-09', goesOff: '2026-11-14', storagePlaceName: place })
const chicken: UsedFromNeed = { ingredientId: 11, ingredient: 'Chicken thighs', quantity: 800, baseUnit: 'g', lots: [lot(1, 500), lot(2, 600, 'Freezer')] }
const main: UsedFromCourseInput = { courseId: 1, courseName: 'Main', needs: [chicken] }
const side: UsedFromCourseInput = { courseId: 2, courseName: 'Side', needs: [chicken] }

describe('useUsedFrom', () => {
  it('starts collapsed with the default summary and no payload', () => {
    const { result } = renderHook(() => useUsedFrom([main]))
    expect(result.current.expanded).toBe(false)
    expect(result.current.summary(1)).toBe('Soonest to go off first')
    expect(result.current.entries(1)).toBeUndefined()
    expect(result.current.hasConflict).toBe(false)
    expect(result.current.lines(1)[0]!.title).toBe('Chicken thighs · 800 g')
  })

  it('toggleExpanded opens and closes the section', () => {
    const { result } = renderHook(() => useUsedFrom([main]))
    act(() => result.current.toggleExpanded())
    expect(result.current.expanded).toBe(true)
  })

  it('ticking a Lot prefills the amount and updates summary and payload', () => {
    const { result } = renderHook(() => useUsedFrom([main]))
    act(() => result.current.toggle(1, 11, 1, true))
    expect(result.current.summary(1)).toBe('Your choice for 1 Ingredient')
    expect(result.current.entries(1)).toEqual([{ ingredientId: 11, lots: [{ lotId: 1, quantity: 500 }] }])
    act(() => result.current.setAmount(1, 11, 1, 250))
    expect(result.current.entries(1)).toEqual([{ ingredientId: 11, lots: [{ lotId: 1, quantity: 250 }] }])
    act(() => result.current.toggle(1, 11, 1, false))
    expect(result.current.entries(1)).toBeUndefined()
  })

  it('keeps picks per Course and flags a Lot over-picked across Courses', () => {
    const { result } = renderHook(() => useUsedFrom([main, side]))
    act(() => result.current.toggle(1, 11, 1, true))
    expect(result.current.hasConflict).toBe(false)
    act(() => result.current.toggle(2, 11, 1, true)) // the second Course asks for the same 500 g Lot
    expect(result.current.entries(2)).toEqual([{ ingredientId: 11, lots: [{ lotId: 1, quantity: 500 }] }])
    expect(result.current.hasConflict).toBe(true)
    expect(result.current.conflicts).toHaveLength(1)
    expect(result.current.conflictMessages).toEqual(['Chicken thighs: the Courses together take more from the Lot in Fridge than it holds'])
    act(() => result.current.setAmount(2, 11, 1, 0))
    expect(result.current.hasConflict).toBe(false)
  })

  it('forgets the picks when the needs change (the Lots were reloaded)', () => {
    const { result, rerender } = renderHook((p: UsedFromCourseInput[]) => useUsedFrom(p), { initialProps: [main] })
    act(() => result.current.toggle(1, 11, 1, true))
    rerender([{ ...main, needs: [{ ...chicken, lots: [lot(5, 500)] }] }])
    expect(result.current.entries(1)).toBeUndefined()
    expect(result.current.summary(1)).toBe('Soonest to go off first')
  })
})
