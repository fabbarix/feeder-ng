// TG-PW: the Slot Rule form's Course. Several Courses: default the main one, reset on a new slot, always sent. One Course: no select, nothing sent.
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSlotRuleForm } from './useRuleForms'

const dinner = {
  id: 5,
  weekday: 5,
  name: 'Dinner',
  time: '19:00',
  courses: [
    { id: 1, name: 'Starter', main: false },
    { id: 2, name: 'Main', main: true },
  ],
}
const lunch = { id: 6, weekday: 6, name: 'Lunch', time: '12:30', courses: [{ id: 7, name: 'Main', main: true }] }
const slots = [dinner, lunch]

describe('useSlotRuleForm Course', () => {
  it('starts on the main Course of the first slot and shows the select', () => {
    const { result } = renderHook(() => useSlotRuleForm(slots, vi.fn()))
    expect(result.current.showCourse).toBe(true)
    expect(result.current.courseId).toBe('2')
    expect(result.current.courses.map((c) => c.id)).toEqual([1, 2])
  })

  it('sends the main Course when none was picked', () => {
    const onAdd = vi.fn()
    const { result } = renderHook(() => useSlotRuleForm(slots, onAdd))
    act(() => result.current.setRecipeId('9'))
    act(() => result.current.submit())
    expect(onAdd).toHaveBeenCalledWith({ mealSlotId: 5, courseId: 2, recipeId: 9 })
  })

  it('sends the picked Course', () => {
    const onAdd = vi.fn()
    const { result } = renderHook(() => useSlotRuleForm(slots, onAdd))
    act(() => result.current.setCourseId('1'))
    act(() => result.current.setKind('tag'))
    act(() => result.current.setTag('fish'))
    act(() => result.current.submit())
    expect(onAdd).toHaveBeenCalledWith({ mealSlotId: 5, courseId: 1, tag: 'fish' })
  })

  it('a slot with one Course hides the select and sends no courseId', () => {
    const onAdd = vi.fn()
    const { result } = renderHook(() => useSlotRuleForm(slots, onAdd))
    act(() => result.current.setMealSlotId('6'))
    expect(result.current.showCourse).toBe(false)
    act(() => result.current.setRecipeId('9'))
    act(() => result.current.submit())
    expect(onAdd).toHaveBeenCalledWith({ mealSlotId: 6, recipeId: 9 })
  })

  it('changing the slot drops a Course that slot does not serve (back to its main Course)', () => {
    const two = { ...dinner, id: 8, courses: [{ id: 3, name: 'Side', main: false }, { id: 4, name: 'Main', main: true }] }
    const { result } = renderHook(() => useSlotRuleForm([dinner, two], vi.fn()))
    act(() => result.current.setCourseId('1'))
    expect(result.current.courseId).toBe('1')
    act(() => result.current.setMealSlotId('8'))
    expect(result.current.courseId).toBe('4')
  })

  it('a slot without a Courses list (older API) shows no select and sends no courseId', () => {
    const onAdd = vi.fn()
    const { result } = renderHook(() => useSlotRuleForm([{ id: 9, weekday: 1, name: 'Dinner', time: '19:00' }], onAdd))
    expect(result.current.showCourse).toBe(false)
    act(() => result.current.setRecipeId('9'))
    act(() => result.current.submit())
    expect(onAdd).toHaveBeenCalledWith({ mealSlotId: 9, recipeId: 9 })
  })
})
