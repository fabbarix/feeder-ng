import { describe, expect, it } from 'vitest'
import { convertConfirm } from './convertConfirm'
import type { ToBasePlan } from './types'

const meal = (over: Partial<ToBasePlan['plannedMeals'][number]> = {}) => ({ date: '2026-11-10', mealSlotName: 'Dinner', courseName: 'Main', pinned: false, bought: false, ...over })
const plan = (over: Partial<ToBasePlan> = {}): ToBasePlan => ({ plannedMeals: [], slotRules: [], leftovers: 0, preferences: 0, ...over })

describe('convertConfirm: names what goes (P6)', () => {
  it('titles and labels the confirm', () => {
    const c = convertConfirm('Pesto', plan())
    expect(c.title).toBe('Turn Pesto into a Base recipe?')
    expect(c.confirmLabel).toBe('Turn into a Base recipe')
  })
  it('with nothing planned says only that it stops being plannable, and that history stays', () => {
    expect(convertConfirm('Pesto', plan()).body).toEqual([
      'Pesto will stop being a plannable Recipe. A Base recipe is never planned on its own.',
      'Cooked history stays.',
    ])
  })
  it('lists the Planned Meals from today on with their Course, Pinned and Bought', () => {
    const body = convertConfirm('Pesto', plan({ plannedMeals: [meal({ pinned: true }), meal({ date: '2026-11-12', mealSlotName: 'Lunch', courseName: 'Side', bought: true, pinned: true })] })).body
    expect(body[1]).toBe('These Planned Meals from today on are removed: Tue 10 Nov Dinner (Main, Pinned), Thu 12 Nov Lunch (Side, Pinned, Bought).')
  })
  it('counts the Slot Rules', () => {
    expect(convertConfirm('Pesto', plan({ slotRules: [{}] })).body).toContain('1 Slot Rule that names it is removed.')
    expect(convertConfirm('Pesto', plan({ slotRules: [{}, {}] })).body).toContain('2 Slot Rules that name it are removed.')
  })
  it('says what happens to Leftovers and to Favourites and Dislikes', () => {
    const body = convertConfirm('Pesto', plan({ leftovers: 2, preferences: 1 })).body
    expect(body).toContain('Its 2 Leftovers stay until you answer them.')
    expect(body).toContain('Its Favourites and Dislikes are removed.')
    expect(convertConfirm('Pesto', plan({ leftovers: 1 })).body).toContain('Its 1 Leftover stays until you answer it.')
  })
  it('ends with "Cooked history stays."', () => {
    expect(convertConfirm('Pesto', plan({ leftovers: 2, slotRules: [{}] })).body.at(-1)).toBe('Cooked history stays.')
  })
})
