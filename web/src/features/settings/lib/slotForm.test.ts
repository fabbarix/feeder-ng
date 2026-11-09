import { describe, expect, it } from 'vitest'
import { slotDraft, slotFromDraft, slotProblem } from './slotForm'

describe('slotForm', () => {
  it('starts blank on Monday', () => {
    expect(slotDraft()).toEqual({ weekday: 1, name: '', time: '', attendance: [] })
  })

  it('copies an existing Meal Slot', () => {
    const slot = { id: 1, weekday: 2, name: 'Dinner', time: '19:30', attendance: [{ memberId: 1, portionFactorOverride: null }], portionsNeeded: 1 }
    expect(slotDraft(slot)).toEqual({ weekday: 2, name: 'Dinner', time: '19:30', attendance: slot.attendance })
  })

  it('asks for a name first, then a time', () => {
    expect(slotProblem({ ...slotDraft(), name: ' ' })).toMatch(/name/i)
    expect(slotProblem({ ...slotDraft(), name: 'Dinner' })).toMatch(/time/i)
    expect(slotProblem({ ...slotDraft(), name: 'Dinner', time: '25:00' })).toMatch(/time/i)
    expect(slotProblem({ ...slotDraft(), name: 'Dinner', time: '19:30' })).toBeNull()
  })

  it('trims the name', () => {
    expect(slotFromDraft({ ...slotDraft(), name: ' Dinner ', time: '19:30' }).name).toBe('Dinner')
  })
})
