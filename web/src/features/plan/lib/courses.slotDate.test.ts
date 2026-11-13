// B5-F1 (reconcile 9, Q3): the slot menu shows whenever a per-date choice applies, for every slot.
import { describe, expect, it } from 'vitest'
import { courseMeal, courseSlot, planCourse, slot } from '../test-utils'
import { slotMenu } from './courses'

const TODAY = '2026-11-10'
const main = planCourse({ courseId: 1, name: 'Main', meal: courseMeal(1, 'Main') })
const side = planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side') })

describe('slotMenu with the per-date choices', () => {
  it('stays as before without them: a one-Course slot has no menu', () => {
    expect(slotMenu(slot({ date: TODAY }), TODAY)).toBeNull()
    expect(slotMenu(slot({ date: TODAY }), TODAY, false)).toBeNull()
  })

  it('a one-Course slot today has Who\'s eating, the time and Not served', () => {
    expect(slotMenu(slot({ date: TODAY }), TODAY, true)).toEqual({
      markAllCooked: false, notCookedSlot: false, add: [], whosEating: true, notServed: true, time: 'Time today',
    })
  })

  it('a later date names its weekday in the time choice', () => {
    expect(slotMenu(slot({ date: '2026-11-12' }), TODAY, true)?.time).toBe('Time on Thu')
  })

  it('a multi-Course slot keeps Mark all Cooked, Not cooked: whole slot and Add <Course> beside them', () => {
    const dessert = planCourse({ courseId: 3, name: 'Dessert', main: false, optional: true, unserved: 'optional' })
    const m = slotMenu(courseSlot([main, side, dessert], { date: TODAY }), TODAY, true)!
    expect(m.markAllCooked).toBe(true)
    expect(m.notCookedSlot).toBe(true)
    expect(m.add.map((a) => a.label)).toEqual(['Add Dessert'])
    expect(m).toMatchObject({ whosEating: true, notServed: true, time: 'Time today' })
  })

  it('a past slot has none of the date choices, so no menu', () => {
    expect(slotMenu(slot({ date: '2026-11-09' }), TODAY, true)).toBeNull()
  })

  it('a Not served slot has no menu (its row has Plan <Slot> again)', () => {
    expect(slotMenu(slot({ date: '2026-11-12', notServed: true }), TODAY, true)).toBeNull()
  })

  it('U2: after a Course is Cooked the menu has no Not served', () => {
    const cooked = planCourse({ courseId: 1, name: 'Main', meal: courseMeal(1, 'Main', { state: 'cooked' }) })
    expect(slotMenu(courseSlot([cooked, side], { date: TODAY }), TODAY, true)).toMatchObject({ whosEating: true, notServed: false, time: 'Time today' })
  })
})
