// ds-plan: the icon actions of a Course row (Swap, Pin, in that order, at the row's end) and of a slot header (Cook, ⋮).
import { describe, expect, it } from 'vitest'
import { courseMeal, courseSlot, meal, planCourse, slot } from '../test-utils'
import { rowActions, slotHead } from './rowActions'

describe('rowActions', () => {
  it('a planned meal offers Swap then Pin', () => {
    expect(rowActions(meal())).toEqual(['swap', 'pin'])
  })

  it('a Pinned meal offers Swap then Unpin', () => {
    expect(rowActions(meal({ pinned: true }))).toEqual(['swap', 'unpin'])
  })

  it('a Cooked or Not cooked meal, and an empty Course, offer none', () => {
    expect(rowActions(meal({ state: 'cooked' }))).toEqual([])
    expect(rowActions(meal({ state: 'skipped' }))).toEqual([])
    expect(rowActions(null)).toEqual([])
  })
})

describe('slotHead', () => {
  const today = '2026-11-10'

  it("Cook is offered for today's planned meal only", () => {
    expect(slotHead(slot({ date: today }), today, false).cook).toBe(true)
    expect(slotHead(slot({ date: '2026-11-11', meal: meal({ date: '2026-11-11' }) }), today, false).cook).toBe(false)
    expect(slotHead(slot({ date: today, meal: meal({ state: 'cooked' }) }), today, false).cook).toBe(false)
  })

  it('with several Courses Cook is still one, for the whole slot', () => {
    const s = courseSlot([planCourse({ courseId: 1, meal: courseMeal(1, 'Main') }), planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side') })], { date: today })
    expect(slotHead(s, today, false).cook).toBe(true)
  })

  it('the ⋮ menu is there when the slot has menu entries (several Courses to resolve), else not', () => {
    const several = courseSlot([planCourse({ courseId: 1, meal: courseMeal(1, 'Main') }), planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side') })], { date: today })
    expect(slotHead(several, today, false).menu).toBe(true)
    expect(slotHead(slot({ date: '2026-11-12', meal: meal({ date: '2026-11-12' }) }), today, false).menu).toBe(false)
  })

  it('with per-date choices (dateActions) every slot has the ⋮ menu', () => {
    expect(slotHead(slot({ date: '2026-11-12', meal: meal({ date: '2026-11-12' }) }), today, true).menu).toBe(true)
  })
})
