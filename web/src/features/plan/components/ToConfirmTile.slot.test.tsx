// DS-TODAY (docs/design/system.md §9; the user chose option A): To confirm is ONE decision per Meal Slot.
// A row: [day + slot badge] [Main Recipe, "+ Side · name"] [ActionGroup: Cooked | All Cooked (primary), Adjust (secondary), ⋮ Not cooked].
// Replaces TodayTiles.courses.test.tsx (one group of buttons per Course + a floating "Mark all Cooked").
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, planCourse, slot } from '../test-utils'
import type { PlanEntry } from '../types'
import { ToConfirmTile } from './TodayTiles'

const entry = (courseId: number, courseName: string, recipeName: string, over: Partial<PlanEntry> = {}): PlanEntry =>
  slot({
    date: '2026-11-11',
    mealSlotId: 4,
    name: 'Dinner',
    courseId,
    courseName,
    meal: courseMeal(courseId, courseName, { recipeName, mealSlotId: 4, date: over.date ?? '2026-11-11' }),
    courses: [planCourse({ courseId: 1, name: 'Main', main: true }), planCourse({ courseId: 2, name: 'Side', main: false })],
    ...over,
  })

function setup(slots: PlanEntry[]) {
  const h = { onYesCooked: vi.fn(), onAdjust: vi.fn(), onNotCooked: vi.fn(), onAllCooked: vi.fn(), onMarkAllCooked: vi.fn(), onNotCookedSlot: vi.fn() }
  const view = render(<ToConfirmTile slots={slots} {...h} />)
  return { ...h, container: view.container }
}

const manicotti = () => entry(1, 'Main', "Sam's Manicotti")
const withSide = () => [entry(1, 'Main', "Sam's Manicotti", { date: '2026-11-12' }), entry(2, 'Side', 'Two-colour cauliflower with peppers', { date: '2026-11-12' })]

describe('ToConfirmTile: one row per Meal Slot', () => {
  it('a slot with several Courses is ONE list item, never one per Course, and no per-Course button groups', () => {
    setup(withSide())
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.queryByRole('group', { name: 'Side' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark all Cooked' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Yes, Cooked' })).not.toBeInTheDocument()
  })

  it('the row has a day and slot badge, the Main Recipe, then "+ Side · name" on one meta line', () => {
    const { container } = setup(withSide())
    const row = screen.getByRole('listitem')
    const when = row.querySelector('.to-confirm__when')!
    expect(when).toHaveTextContent('Thu')
    expect(when).toHaveTextContent('Dinner')
    expect(row.querySelector('.to-confirm__title')).toHaveTextContent("Sam's Manicotti")
    expect(row.querySelector('.to-confirm__meta')).toHaveTextContent('+ Side · Two-colour cauliflower with peppers')
    // DOM order = visual order: badge, text, actions
    const [w, t, a] = ['.to-confirm__when', '.to-confirm__text', '[role="group"]'].map((q) => container.querySelector(q)!)
    expect(w!.compareDocumentPosition(t!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(t!.compareDocumentPosition(a!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('the same dish never appears twice in a row (a side named like the Main Recipe is not repeated)', () => {
    setup([manicotti(), entry(2, 'Side', "Sam's Manicotti")])
    expect(screen.getAllByText("Sam's Manicotti")).toHaveLength(1)
  })

  it('two slots are two rows, in order', () => {
    setup([manicotti(), entry(1, 'Main', 'Soup', { date: '2026-11-10', mealSlotId: 1, name: 'Lunch' })])
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent("Sam's Manicotti")
    expect(rows[1]).toHaveTextContent('Soup')
  })

  it('is a full-width surface tile whose title row has the info-tone badge, the heading and the count of rows', () => {
    const { container } = setup([manicotti(), entry(1, 'Main', 'Soup', { date: '2026-11-10', mealSlotId: 1, name: 'Lunch' })])
    const heading = screen.getByRole('heading', { name: 'To confirm' })
    expect(heading.closest('[data-span]')).toHaveAttribute('data-span', 'full')
    expect(container.querySelector('.to-confirm__badge')).toHaveAttribute('data-tone', 'info')
    expect(container.querySelector('.to-confirm__badge svg')).toBeInTheDocument()
    expect(container.querySelector('.to-confirm__count')).toHaveTextContent('2')
  })

  it('renders nothing when there is nothing to confirm', () => {
    const { container } = setup([])
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ToConfirmTile: one ActionGroup per row', () => {
  it('one Course: primary "Cooked" (one tap, the Course key), secondary "Adjust", Not cooked in ⋮', async () => {
    const h = setup([manicotti()])
    const group = screen.getByRole('group', { name: 'Wed Dinner' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Cooked', 'Adjust', ''])
    expect(buttons[0]).toHaveAttribute('data-variant', 'primary')
    expect(buttons[1]).toHaveAttribute('data-variant', 'secondary')
    expect(buttons[2]).toHaveAccessibleName('More for Wed Dinner')
    const key = { date: '2026-11-11', mealSlotId: 4, courseId: 1 }
    await userEvent.click(buttons[0]!)
    expect(h.onYesCooked).toHaveBeenCalledWith(key)
    await userEvent.click(buttons[1]!)
    expect(h.onAdjust).toHaveBeenCalledWith(key)
    await userEvent.click(buttons[2]!)
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Not cooked' }))
    expect(h.onNotCooked).toHaveBeenCalledWith(key)
    expect(screen.queryByRole('button', { name: 'Not cooked' })).not.toBeInTheDocument() // it lives in the ⋮ only
  })

  it('several Courses: primary "All Cooked" for the slot (one tap), "Adjust" opens the Mark all Cooked sheet, Not cooked is the whole slot', async () => {
    const h = setup(withSide())
    const group = screen.getByRole('group', { name: 'Thu Dinner' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['All Cooked', 'Adjust', ''])
    expect(within(group).getByRole('button', { name: 'All Cooked' })).toHaveAttribute('data-variant', 'primary')
    const slotKey = { date: '2026-11-12', mealSlotId: 4 }
    await userEvent.click(within(group).getByRole('button', { name: 'All Cooked' }))
    expect(h.onAllCooked).toHaveBeenCalledWith(slotKey)
    await userEvent.click(within(group).getByRole('button', { name: 'Adjust' }))
    expect(h.onMarkAllCooked).toHaveBeenCalledWith(slotKey)
    await userEvent.click(within(group).getByRole('button', { name: 'More for Thu Dinner' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Not cooked' }))
    expect(h.onNotCookedSlot).toHaveBeenCalledWith(slotKey)
    expect(h.onYesCooked).not.toHaveBeenCalled()
    expect(h.onNotCooked).not.toHaveBeenCalled()
  })

  it('at most one primary per row, and every row has its own labelled group', () => {
    setup([...withSide(), manicotti()])
    expect(screen.getAllByRole('group')).toHaveLength(2)
    for (const g of screen.getAllByRole('group')) expect(g.querySelectorAll('[data-variant="primary"]')).toHaveLength(1)
  })
})
