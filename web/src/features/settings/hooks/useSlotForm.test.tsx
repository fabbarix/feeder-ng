import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { members, mondayLunch, tuesdayDinner } from '../components/fixtures'
import { useSlotForm } from './useSlotForm'

const wed = { ...tuesdayDinner, id: 13, weekday: 3 }
const base = { members, onSave: vi.fn(), locale: 'en' }

describe('useSlotForm (the Meal Slot sheet\'s state and derived values)', () => {
  it('add mode: blank draft with every Member attending, the default weekdays, and a prefilled name', () => {
    const { result } = renderHook(() => useSlotForm({ ...base, defaultWeekdays: [5], defaultName: 'Dinner' }))
    expect(result.current.weekdays).toEqual([5])
    expect(result.current.draft.name).toBe('Dinner')
    expect(result.current.draft.attendance).toHaveLength(3)
    expect(result.current.summary).toBeNull()
  })

  it('add mode: submit saves one body per chosen weekday, ascending', () => {
    const onSave = vi.fn()
    const { result } = renderHook(() => useSlotForm({ ...base, onSave, defaultWeekdays: [] }))
    act(() => result.current.setWeekdays([4, 2]))
    act(() => result.current.set({ name: ' Tea ', time: '16:00' }))
    act(() => result.current.submit())
    expect(onSave.mock.calls[0]![0].map((i: { weekday: number; name: string }) => [i.weekday, i.name])).toEqual([[2, 'Tea'], [4, 'Tea']])
  })

  it('add mode: no weekday is a weekday problem, a blank name a form problem', () => {
    const { result } = renderHook(() => useSlotForm({ ...base }))
    act(() => result.current.submit())
    expect(result.current.problem).toEqual({ message: 'Choose at least one weekday.', field: 'weekdays' })
    act(() => result.current.setWeekdays([1]))
    act(() => result.current.submit())
    expect(result.current.problem?.field).toBe('form')
  })

  it('edit mode: the summary names the matched days and the skipped ones', () => {
    const { result } = renderHook(() => useSlotForm({ ...base, slot: tuesdayDinner, slots: [mondayLunch, tuesdayDinner, wed] }))
    act(() => result.current.setWeekdays([2, 3, 5]))
    expect(result.current.summary?.update).toBe('Update Dinner on Tue, Wed')
    expect(result.current.summary?.skipped).toEqual(['Fri skipped: no Dinner'])
    expect(result.current.picks.length).toBeGreaterThan(0)
  })

  it('edit mode: submit applies the batch request; no change is a form problem', () => {
    const onApply = vi.fn()
    const { result } = renderHook(() => useSlotForm({ ...base, slot: tuesdayDinner, slots: [tuesdayDinner, wed], onApply }))
    act(() => result.current.submit())
    expect(result.current.problem?.message).toBe('Nothing to change.')
    act(() => result.current.set({ time: '20:00' }))
    act(() => result.current.submit())
    expect(onApply).toHaveBeenCalledWith({ match: 'Dinner', weekdays: [2], set: { time: '20:00' } })
  })

  it('a partial save hands back new default weekdays and the selection follows them', () => {
    const { result, rerender } = renderHook((p: { d: number[] }) => useSlotForm({ ...base, defaultWeekdays: p.d }), { initialProps: { d: [1, 2] } })
    rerender({ d: [2] })
    expect(result.current.weekdays).toEqual([2])
  })
})
