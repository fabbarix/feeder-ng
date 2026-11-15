// B9-26 (SAFE-03): the Planned Meal sheet of a Cooked or Not cooked meal says how it was marked and offers Undo until the end of the
// household day (only the Undo actions are B9-26's; the sheet's layout is B9-38's). 2026-11-14 is a Saturday; the zone is Europe/Rome.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MealResolution } from '../lib/resolved'
import { courseMeal, courseSlot, planCourse } from '../test-utils'
import type { PlanSlot } from '../types'
import { PlannedMealSheet } from './PlannedMealSheet'

const resolution = (over: Partial<MealResolution> = {}): MealResolution => ({
  kind: 'cooked', markedOn: '2026-11-14', markedAt: '2026-11-14T07:40:00Z', markedBy: 'Anna', leftoverPortions: 1.25, canUndo: true, ...over,
})
const resolved = (state: 'cooked' | 'skipped', r: MealResolution | undefined, courseId = 1) =>
  planCourse({ courseId, name: ['Main', 'Side', 'Dessert'][courseId - 1]!, main: courseId === 1, meal: { ...courseMeal(courseId, 'Main', { date: '2026-11-14', mealSlotId: 2, state, recipeName: 'Slow cooker beef and barley stew' }), resolution: r } as never })
const slotOf = (courses = [resolved('cooked', resolution())]): PlanSlot => courseSlot(courses, { date: '2026-11-14', mealSlotId: 2, name: 'Breakfast', time: '08:30' })

function setup(slot: PlanSlot, props: Record<string, unknown> = {}, courseId = 1) {
  const h = { onClose: vi.fn(), onCook: vi.fn(), onMarkCooked: vi.fn(), onSwap: vi.fn(), onPin: vi.fn(), onUnpin: vi.fn(), onChoose: vi.fn(), onUndoCooked: vi.fn(), onUndoNotCooked: vi.fn(), onCookedAfterAll: vi.fn() }
  render(<PlannedMealSheet open slot={slot} courseId={courseId} today="2026-11-14" timeZone="Europe/Rome" {...h} {...props} />)
  return h
}
const dialog = () => within(screen.getByRole('dialog'))
const key = { date: '2026-11-14', mealSlotId: 2, courseId: 1 }

describe('a Cooked meal that can be undone', () => {
  it('says how it was marked, what Undo does and until when, and offers one outline Undo Cooked', () => {
    setup(slotOf())
    expect(dialog().getByText('Marked Cooked today at 08:40 by Anna. 1.25 portions were kept as a Leftover.')).toBeInTheDocument()
    expect(dialog().getByText('Undo Cooked puts back the Stock it used and removes its Leftover. You can undo it until the end of today, while nobody has had any of the Leftover.')).toBeInTheDocument()
    expect(dialog().getByRole('button', { name: 'Undo Cooked' })).toHaveAttribute('data-variant', 'secondary')
  })

  it('has no other action (no Cook, Swap, Pin) and keeps the circular Close, no Cancel', () => {
    setup(slotOf())
    const names = dialog().getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names.filter((n) => n !== 'Close')).toEqual(['Undo Cooked'])
    expect(dialog().getAllByRole('button', { name: 'Close' })).toHaveLength(1)
    expect(dialog().queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('Undo Cooked reports the Course', async () => {
    const h = setup(slotOf())
    await userEvent.click(dialog().getByRole('button', { name: 'Undo Cooked' }))
    expect(h.onUndoCooked).toHaveBeenCalledWith(key)
  })

  it('a Course marked together with the others by one Mark all reads "Undo Cooked for all 3 Courses" (it is undone as a whole)', async () => {
    const h = setup(slotOf([resolved('cooked', resolution(), 1), resolved('cooked', resolution(), 2), resolved('cooked', resolution(), 3)]), {}, 2)
    expect(dialog().queryByRole('button', { name: 'Undo Cooked' })).toBeNull()
    await userEvent.click(dialog().getByRole('button', { name: 'Undo Cooked for all 3 Courses' }))
    expect(h.onUndoCooked).toHaveBeenCalledWith({ ...key, courseId: 2 })
  })
})

describe('a Cooked meal that can no longer be undone: the hint says why and there is no button', () => {
  it('the Leftover was had', () => {
    setup(slotOf([resolved('cooked', resolution({ canUndo: false, cannotUndo: 'leftover_used' }))]))
    expect(dialog().getByText("Some of its Leftover was already had, so Cooked can't be undone.")).toBeInTheDocument()
    expect(dialog().queryByRole('button', { name: /^Undo/ })).toBeNull()
  })

  it('the day is over (the read says window_over)', () => {
    setup(slotOf([resolved('cooked', resolution({ markedOn: '2026-11-13', canUndo: false, cannotUndo: 'window_over' }))]))
    expect(dialog().getByText('Marked on Fri, so it can no longer be undone.')).toBeInTheDocument()
    expect(dialog().queryByRole('button', { name: /^Undo/ })).toBeNull()
  })

  it('offline: the words stay, the Undo is not offered', () => {
    setup(slotOf(), { offline: true })
    expect(dialog().getByText(/^Marked Cooked today at 08:40/)).toBeInTheDocument()
    expect(dialog().queryByRole('button', { name: /^Undo/ })).toBeNull()
  })
})

describe('a Not cooked meal', () => {
  const notCooked = () => slotOf([resolved('skipped', resolution({ kind: 'not_cooked', leftoverPortions: 0 }))])

  it('says how it was marked, and offers Cooked after all (primary) then Undo Not cooked (outline)', () => {
    setup(notCooked())
    expect(dialog().getByText('Marked Not cooked today at 08:40 by Anna.')).toBeInTheDocument()
    expect(dialog().getByText('Cooked after all? Mark it now and Feeder takes the Stock it used. Undo Not cooked puts it back in To confirm.')).toBeInTheDocument()
    const names = dialog().getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent).filter((n) => n !== 'Close')
    // B9-38 (SHORT-02): the footer is one FormActions row, whose DOM order puts the primary last.
    expect(names).toEqual(['Undo Not cooked', 'Cooked after all'])
    expect(dialog().getByRole('button', { name: 'Cooked after all' })).toHaveAttribute('data-variant', 'primary')
    expect(dialog().getByRole('button', { name: 'Undo Not cooked' })).toHaveAttribute('data-variant', 'secondary')
  })

  it('each reports the Course', async () => {
    const h = setup(notCooked())
    await userEvent.click(dialog().getByRole('button', { name: 'Cooked after all' }))
    await userEvent.click(dialog().getByRole('button', { name: 'Undo Not cooked' }))
    expect(h.onCookedAfterAll).toHaveBeenCalledWith(key)
    expect(h.onUndoNotCooked).toHaveBeenCalledWith(key)
  })
})

describe('an older server (no `resolution`)', () => {
  it('the sheet is as before: no summary, no hint, no Undo', () => {
    setup(slotOf([resolved('cooked', undefined)]))
    expect(dialog().queryByText(/^Marked/)).toBeNull()
    expect(dialog().queryByRole('button', { name: /^Undo/ })).toBeNull()
  })

  it('a planned meal shows none of it', () => {
    setup(courseSlot([planCourse({ courseId: 1, meal: courseMeal(1, 'Main', { date: '2026-11-14', mealSlotId: 2 }) })], { date: '2026-11-14', mealSlotId: 2 }))
    expect(dialog().queryByText(/^Marked/)).toBeNull()
  })
})
