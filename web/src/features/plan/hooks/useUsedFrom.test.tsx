import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { UsedFromNeed } from '../lib/usedFrom'
import { useUsedFrom, type UsedFromCourseInput } from './useUsedFrom'

const lot = (id: number, quantity: number, place = 'Fridge') => ({ id, quantity, purchased: '2026-11-09', goesOff: '2026-11-14', storagePlaceName: place })
const chicken: UsedFromNeed = { ingredientId: 11, ingredient: 'Chicken thighs', quantity: 800, baseUnit: 'g', lots: [lot(1, 500), lot(2, 600, 'Freezer')] }
const OPTS = { unitSystem: 'metric' as const, today: '2026-11-01' }
const main: UsedFromCourseInput = { courseId: 1, courseName: 'Main', needs: [chicken] }
const side: UsedFromCourseInput = { courseId: 2, courseName: 'Side', needs: [chicken] }

describe('useUsedFrom', () => {
  it('starts collapsed with the default summary and no payload', () => {
    const { result } = renderHook(() => useUsedFrom([main], OPTS))
    expect(result.current.expanded(1)).toBe(false)
    expect(result.current.summary(1)).toBe('Soonest to go off first')
    expect(result.current.entries(1)).toBeUndefined()
    expect(result.current.hasConflict).toBe(false)
    expect(result.current.lines(1)[0]!.title).toBe('Chicken thighs · 800 g')
  })

  it('expansion is per Course', () => {
    const { result } = renderHook(() => useUsedFrom([main, side], OPTS))
    act(() => result.current.toggleExpanded(1))
    expect(result.current.expanded(1)).toBe(true)
    expect(result.current.expanded(2)).toBe(false)
    act(() => result.current.toggleExpanded(2))
    act(() => result.current.toggleExpanded(1))
    expect(result.current.expanded(1)).toBe(false)
    expect(result.current.expanded(2)).toBe(true)
  })

  it('formats the lines with the given unit system and today', () => {
    const imperial = renderHook(() => useUsedFrom([main], { unitSystem: 'imperial', today: '2026-11-20' }))
    expect(imperial.result.current.lines(1)[0]!.title).toMatch(/oz|lb/)
    expect(imperial.result.current.lines(1)[0]!.lots[0]!.meta).toMatch(/^Went off /)
  })

  it('clearing an amount (null) clears the pick', () => {
    const { result } = renderHook(() => useUsedFrom([main], OPTS))
    act(() => result.current.toggle(1, 11, 1, true))
    act(() => result.current.setAmount(1, 11, 1, null))
    expect(result.current.entries(1)).toBeUndefined()
    expect(result.current.lines(1)[0]!.lots[0]!.picked).toBe(false)
  })

  it('ticking a Lot prefills the amount and updates summary and payload', () => {
    const { result } = renderHook(() => useUsedFrom([main], OPTS))
    act(() => result.current.toggle(1, 11, 1, true))
    expect(result.current.summary(1)).toBe('Your choice for 1 Ingredient')
    expect(result.current.entries(1)).toEqual([{ ingredientId: 11, lots: [{ lotId: 1, quantity: 500 }] }])
    act(() => result.current.setAmount(1, 11, 1, 250))
    expect(result.current.entries(1)).toEqual([{ ingredientId: 11, lots: [{ lotId: 1, quantity: 250 }] }])
    act(() => result.current.toggle(1, 11, 1, false))
    expect(result.current.entries(1)).toBeUndefined()
  })

  it('keeps picks per Course and flags a Lot over-picked across Courses', () => {
    const { result } = renderHook(() => useUsedFrom([main, side], OPTS))
    act(() => result.current.toggle(1, 11, 1, true))
    expect(result.current.hasConflict).toBe(false)
    act(() => result.current.toggle(2, 11, 1, true)) // the second Course asks for the same 500 g Lot
    expect(result.current.entries(2)).toEqual([{ ingredientId: 11, lots: [{ lotId: 1, quantity: 500 }] }])
    expect(result.current.hasConflict).toBe(true)
    expect(result.current.conflicts).toHaveLength(1)
    expect(Object.keys(result.current.conflictMessages)).toEqual(['1'])
    const message = result.current.conflictMessages[1]!
    expect(message).toContain('Chicken thighs')
    expect(message).toContain('Fridge')
    expect(message).toContain('500 g') // names the Lot by its quantity
    act(() => result.current.setAmount(2, 11, 1, 0))
    expect(result.current.hasConflict).toBe(false)
  })

  it('forgets the picks when the needs change (the Lots were reloaded)', () => {
    const { result, rerender } = renderHook((p: UsedFromCourseInput[]) => useUsedFrom(p, OPTS), { initialProps: [main] })
    act(() => result.current.toggle(1, 11, 1, true))
    rerender([{ ...main, needs: [{ ...chicken, lots: [lot(5, 500)] }] }])
    expect(result.current.entries(1)).toBeUndefined()
    expect(result.current.summary(1)).toBe('Soonest to go off first')
  })

  it('conflict messages are keyed by lotId and tell two Lots in one place apart', () => {
    const two: UsedFromNeed = { ...chicken, lots: [lot(1, 500), lot(4, 300)] }
    const a: UsedFromCourseInput = { courseId: 1, courseName: 'Main', needs: [two] }
    const b: UsedFromCourseInput = { courseId: 2, courseName: 'Side', needs: [two] }
    const { result } = renderHook(() => useUsedFrom([a, b], OPTS))
    for (const courseId of [1, 2]) {
      act(() => result.current.toggle(courseId, 11, 1, true))
      act(() => result.current.toggle(courseId, 11, 4, true))
    }
    const messages = result.current.conflictMessages
    expect(Object.keys(messages).sort()).toEqual(['1', '4'])
    expect(messages[1]).not.toBe(messages[4])
    expect(messages[1]).toContain('500 g')
    expect(messages[4]).toContain('300 g')
  })

  it('a Lot in no Storage Place reads Not sorted in the conflict message', () => {
    const loose: UsedFromNeed = { ...chicken, lots: [lot(1, 500, '')] }
    const a: UsedFromCourseInput = { courseId: 1, courseName: 'Main', needs: [loose] }
    const b: UsedFromCourseInput = { courseId: 2, courseName: 'Side', needs: [loose] }
    const { result } = renderHook(() => useUsedFrom([a, b], OPTS))
    act(() => result.current.toggle(1, 11, 1, true))
    act(() => result.current.toggle(2, 11, 1, true))
    expect(result.current.conflictMessages[1]).toContain('Not sorted')
  })
})
