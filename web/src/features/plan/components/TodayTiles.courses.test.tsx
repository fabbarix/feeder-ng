// CRS F (spec 8): To confirm groups a slot's Courses under one heading, each confirmed on its own, plus Mark all Cooked.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, slot } from '../test-utils'
import type { PlanEntry } from '../types'
import { ToConfirmTile } from './TodayTiles'

const entry = (courseId: number, courseName: string, recipeName: string, over: Partial<PlanEntry> = {}): PlanEntry =>
  slot({ date: '2026-11-09', courseId, courseName, meal: courseMeal(courseId, courseName, { recipeName, date: '2026-11-09' }), ...over })

function setup(slots: PlanEntry[]) {
  const h = { onYesCooked: vi.fn(), onAdjust: vi.fn(), onNotCooked: vi.fn(), onMarkAllCooked: vi.fn() }
  const view = render(<ToConfirmTile slots={slots} {...h} />)
  return { ...h, container: view.container }
}

describe('ToConfirmTile with Courses', () => {
  it('one Course per slot looks exactly as before, even when the entries carry a courseId (regression guard)', () => {
    const plain = render(<ToConfirmTile slots={[slot({ date: '2026-11-09', courseId: 1, courseName: 'Main' })]} onYesCooked={() => {}} onAdjust={() => {}} onNotCooked={() => {}} />)
    const old = plain.container.innerHTML
    plain.unmount()
    const withCourse = render(<ToConfirmTile slots={[slot({ date: '2026-11-09', courseId: 1, courseName: 'Main', meal: courseMeal(1, 'Main', { date: '2026-11-09' }) })]} onYesCooked={() => {}} onAdjust={() => {}} onNotCooked={() => {}} />)
    expect(withCourse.container.innerHTML).toBe(old)
  })

  it('groups the Courses of a slot under one heading, "Mon Dinner: Roast chicken, Green beans"', () => {
    setup([entry(1, 'Main', 'Roast chicken'), entry(2, 'Side', 'Green beans')])
    expect(screen.getByText('Mon Dinner: Roast chicken, Green beans')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('each Course is confirmed on its own, reporting its key with the Course', async () => {
    const h = setup([entry(1, 'Main', 'Roast chicken'), entry(2, 'Side', 'Green beans')])
    const side = screen.getByRole('group', { name: 'Side' })
    await userEvent.click(within(side).getByRole('button', { name: 'Yes, Cooked' }))
    await userEvent.click(within(side).getByRole('button', { name: 'Adjust' }))
    await userEvent.click(within(side).getByRole('button', { name: 'Not cooked' }))
    const key = { date: '2026-11-09', mealSlotId: 2, courseId: 2 }
    expect(h.onYesCooked).toHaveBeenCalledWith(key)
    expect(h.onAdjust).toHaveBeenCalledWith(key)
    expect(h.onNotCooked).toHaveBeenCalledWith(key)
  })

  it('Mark all Cooked reports the slot', async () => {
    const h = setup([entry(1, 'Main', 'Roast chicken'), entry(2, 'Side', 'Green beans')])
    await userEvent.click(screen.getByRole('button', { name: 'Mark all Cooked' }))
    expect(h.onMarkAllCooked).toHaveBeenCalledWith({ date: '2026-11-09', mealSlotId: 2 })
  })

  it('a slot with one Course to confirm has no Mark all Cooked', () => {
    setup([entry(1, 'Main', 'Roast chicken')])
    expect(screen.queryByRole('button', { name: 'Mark all Cooked' })).not.toBeInTheDocument()
  })

  it('two slots stay two groups, in order', () => {
    setup([entry(1, 'Main', 'Roast chicken'), entry(2, 'Side', 'Green beans'), entry(1, 'Main', 'Soup', { mealSlotId: 1, name: 'Lunch' })])
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Mon Lunch')).toBeInTheDocument()
  })
})
