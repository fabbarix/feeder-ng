// B9-38 (PC-10): the context line above a sheet opened from a meal. 2026-11-17 is a Tuesday, 2026-11-15 a Sunday.
import { describe, expect, it } from 'vitest'
import { slotContext } from './days'

describe('slotContext', () => {
  it('Swap and Choose a Recipe: the day, the Meal Slot and the Course', () => {
    expect(slotContext({ date: '2026-11-17', slotName: 'Breakfast', courseName: 'Main' })).toBe('Tue 17 · Breakfast · Main')
    expect(slotContext({ date: '2026-11-15', slotName: 'Dinner', courseName: 'Dessert' })).toBe('Sun 15 · Dinner · Dessert')
  })

  it('the Planned Meal sheet adds the slot time to the Meal Slot', () => {
    expect(slotContext({ date: '2026-11-15', slotName: 'Dinner', time: '19:00', courseName: 'Side' })).toBe('Sun 15 · Dinner 19:00 · Side')
  })

  it('leaves the Course out when none is given (a slot with one Course)', () => {
    expect(slotContext({ date: '2026-11-15', slotName: 'Dinner', time: '19:00' })).toBe('Sun 15 · Dinner 19:00')
    expect(slotContext({ date: '2026-11-15', slotName: 'Lunch' })).toBe('Sun 15 · Lunch')
  })

  it('never prints an ISO date, and keeps a one-digit day without a leading zero', () => {
    const text = slotContext({ date: '2026-11-03', slotName: 'Lunch', courseName: 'Main' })
    expect(text).toBe('Tue 3 · Lunch · Main')
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })
})
