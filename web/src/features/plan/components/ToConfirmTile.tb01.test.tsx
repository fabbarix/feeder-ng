// B9-39 (TB-01, A11Y-08, B9-26 ruling 9): the To confirm rows' Cooked, All Cooked and Adjust buttons are named by what they act on, so no two
// buttons of Today share a name (P38 on `/`, the bridge `P38@/ = warn until B9-39` is deleted); and after a row goes (Not cooked, Cooked)
// focus moves to the next row, never to the page's start.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, planCourse, slot } from '../test-utils'
import type { PlanEntry } from '../types'
import { ToConfirmTile } from './TodayTiles'

// 2026-11-09 is a Monday.
const entry = (date: string, mealSlotId: number, slotName: string, recipe: string, over: Partial<PlanEntry> = {}): PlanEntry =>
  slot({
    date, mealSlotId, name: slotName, time: '13:00', at: `${date}T13:00:00Z`, courseId: 1, courseName: 'Main',
    meal: courseMeal(1, 'Main', { recipeName: recipe, mealSlotId, date }),
    courses: [planCourse({ courseId: 1, name: 'Main', main: true })],
    ...over,
  })
const lunch = () => entry('2026-11-09', 2, 'Lunch', 'Lentil soup')
const dinner = () => entry('2026-11-09', 3, 'Dinner', "Sam's Manicotti")
const breakfast = () => entry('2026-11-10', 1, 'Breakfast', 'Porridge')
const handlers = () => ({ onYesCooked: vi.fn(), onAdjust: vi.fn(), onNotCooked: vi.fn(), onAllCooked: vi.fn(), onMarkAllCooked: vi.fn(), onNotCookedSlot: vi.fn() })

describe('the buttons of each To confirm row are named by their Recipe, day and Meal Slot (A11Y-08)', () => {
  it('Cooked and Adjust: "Cooked Lentil soup, Mon 9 Lunch" (the visible text first, so the name contains it)', () => {
    render(<ToConfirmTile slots={[lunch()]} {...handlers()} />)
    const cooked = screen.getByRole('button', { name: 'Cooked Lentil soup, Mon 9 Lunch' })
    expect(cooked).toHaveTextContent(/^Cooked$/)
    expect(screen.getByRole('button', { name: 'Adjust Lentil soup, Mon 9 Lunch' })).toHaveTextContent(/^Adjust$/)
    expect(cooked).toHaveAttribute('data-variant', 'primary')
  })

  it('several Courses: "All Cooked <Main>, Thu 12 Dinner" and "Adjust <Main>, Thu 12 Dinner"', () => {
    const main = entry('2026-11-12', 4, 'Dinner', 'Roast chicken')
    const side = entry('2026-11-12', 4, 'Dinner', 'Green beans', { courseId: 2, courseName: 'Side', meal: courseMeal(2, 'Side', { recipeName: 'Green beans', mealSlotId: 4, date: '2026-11-12' }), courses: [planCourse({ courseId: 1, name: 'Main', main: true }), planCourse({ courseId: 2, name: 'Side', main: false })] })
    render(<ToConfirmTile slots={[{ ...main, courses: side.courses }, side]} {...handlers()} />)
    expect(screen.getByRole('button', { name: 'All Cooked Roast chicken, Thu 12 Dinner' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adjust Roast chicken, Thu 12 Dinner' })).toBeInTheDocument()
  })

  it('no two buttons of a tile with three rows share a name, and every press reports its own row', async () => {
    const h = handlers()
    render(<ToConfirmTile slots={[lunch(), dinner(), breakfast()]} {...h} />)
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? (b.textContent ?? '').trim())
    expect(new Set(names).size).toBe(names.length)
    await userEvent.click(screen.getByRole('button', { name: "Cooked Sam's Manicotti, Mon 9 Dinner" }))
    expect(h.onYesCooked).toHaveBeenCalledWith({ date: '2026-11-09', mealSlotId: 3, courseId: 1 })
    await userEvent.click(screen.getByRole('button', { name: 'Adjust Porridge, Tue 10 Breakfast' }))
    expect(h.onAdjust).toHaveBeenCalledWith({ date: '2026-11-10', mealSlotId: 1, courseId: 1 })
  })

  it('the row\'s group keeps its name ("Mon Lunch") and the ⋮ is "More for Mon Lunch"', () => {
    render(<ToConfirmTile slots={[lunch()]} {...handlers()} />)
    const group = screen.getByRole('group', { name: 'Mon Lunch' })
    expect(within(group).getByRole('button', { name: 'More for Mon Lunch' })).toBeInTheDocument()
  })
})

describe('after a row goes, focus moves to the next row (B9-26 ruling 9: after Not cooked on Today)', () => {
  const primaryOf = (recipe: string) => screen.getByRole('button', { name: new RegExp(`^Cooked ${recipe}, `) })

  it('the ⋮ of the middle row had focus and the row went: focus lands on the Cooked button of the row that took its place', () => {
    const h = handlers()
    const { rerender } = render(<ToConfirmTile slots={[lunch(), dinner(), breakfast()]} {...h} />)
    act(() => screen.getByRole('button', { name: 'More for Mon Dinner' }).focus())
    rerender(<ToConfirmTile slots={[lunch(), breakfast()]} {...h} />)
    expect(document.activeElement).toBe(primaryOf('Porridge'))
  })

  it('the last row went: focus lands on the row before it', () => {
    const h = handlers()
    const { rerender } = render(<ToConfirmTile slots={[lunch(), dinner()]} {...h} />)
    act(() => screen.getByRole('button', { name: 'More for Mon Dinner' }).focus())
    rerender(<ToConfirmTile slots={[lunch()]} {...h} />)
    expect(document.activeElement).toBe(primaryOf('Lentil soup'))
  })

  it('the first row went (Cooked, whose button had focus): focus lands on the new first row', () => {
    const h = handlers()
    const { rerender } = render(<ToConfirmTile slots={[lunch(), dinner()]} {...h} />)
    act(() => primaryOf('Lentil soup').focus())
    rerender(<ToConfirmTile slots={[dinner()]} {...h} />)
    expect(document.activeElement).toBe(primaryOf("Sam's Manicotti"))
  })

  it('focus that was somewhere else stays there, and the first render takes none', () => {
    const h = handlers()
    const { rerender } = render(
      <>
        <button type="button">Elsewhere</button>
        <ToConfirmTile slots={[lunch(), dinner()]} {...h} />
      </>,
    )
    expect(document.activeElement).toBe(document.body)
    act(() => screen.getByRole('button', { name: 'Elsewhere' }).focus())
    rerender(
      <>
        <button type="button">Elsewhere</button>
        <ToConfirmTile slots={[dinner()]} {...h} />
      </>,
    )
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Elsewhere' }))
  })

  it('the only row went: the tile is gone and nothing throws', () => {
    const h = handlers()
    const { rerender, container } = render(<ToConfirmTile slots={[lunch()]} {...h} />)
    act(() => screen.getByRole('button', { name: 'More for Mon Lunch' }).focus())
    rerender(<ToConfirmTile slots={[]} {...h} />)
    expect(container).toBeEmptyDOMElement()
  })
})
