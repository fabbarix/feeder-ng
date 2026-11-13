// ds-plan (option B): a day tile is one grid track wide like every other; today is the accent ring, not a bigger tile.
// Hierarchy: Day title-3 -> Meal Slot header -> Course rows.
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { groupByDay } from '../lib/days'
import { courseMeal, courseSlot, planCourse, slot } from '../test-utils'
import { DayTile } from './DayTile'

const handlers = { onOpen: vi.fn(), onSwap: vi.fn(), onChoose: vi.fn(), onCook: vi.fn(), onPin: vi.fn(), onUnpin: vi.fn(), today: '2026-11-09' }
const dinner = (date: string) =>
  courseSlot([planCourse({ courseId: 1, meal: courseMeal(1, 'Main', { date, recipeName: 'Pasta' }) }), planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { date, recipeName: 'Salad' }) })], { date, mealSlotId: 2 })
const days = groupByDay([dinner('2026-11-09'), dinner('2026-11-10'), dinner('2026-11-11')], '2026-11-09')
const view = (i: number) => render(<MemoryRouter><DayTile day={days[i]!} {...handlers} /></MemoryRouter>)

describe('DayTile', () => {
  it('the title is ONE h2: "Mon 9 · Today", "Tue 10 · Tomorrow", "Wed 11"', () => {
    view(0)
    expect(screen.getByRole('heading', { level: 2, name: 'Mon 9 · Today' })).toHaveClass('plan-day__title')
  })

  it.each([[1, 'Tue 10 · Tomorrow'], [2, 'Wed 11']])('day %i is titled %s and has no separate date overline', (i, title) => {
    const { container } = view(i)
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    expect(container.querySelector('.tile__overline')).toBeNull()
  })

  it("today takes ONE track (no span 2) and carries data-today for the accent ring", () => {
    view(0)
    const tile = screen.getByRole('article')
    expect(tile).not.toHaveAttribute('data-span', '2')
    expect(tile).toHaveAttribute('data-today', 'true')
    expect(tile).toHaveAttribute('data-variant', 'surface')
  })

  it('other days are not marked today and are the same width: no span either', () => {
    view(1)
    const tile = screen.getByRole('article')
    expect(tile).not.toHaveAttribute('data-today')
    expect(tile).not.toHaveAttribute('data-span', '2')
  })

  it('hierarchy: title, then the slot header, then the Course rows, in document order', () => {
    const { container } = view(0)
    const title = container.querySelector('.plan-day__title')!
    const head = container.querySelector('.plan-slot-head')!
    const row = container.querySelector('li.list-row')!
    expect(title.compareDocumentPosition(head) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(head.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(container as HTMLElement).getAllByRole('listitem')).toHaveLength(2)
  })

  it('the divider flag appears only with 3 or more meals', () => {
    const many = (n: number) => groupByDay(Array.from({ length: n }, (_, i) => slot({ date: '2026-11-10', mealSlotId: i + 1, name: `Slot ${i + 1}`, time: `${8 + i * 4}:00` })), '2026-11-09')[0]!
    const { unmount } = render(<MemoryRouter><DayTile day={many(2)} {...handlers} /></MemoryRouter>)
    expect(screen.getByRole('article')).not.toHaveAttribute('data-dividers')
    unmount()
    render(<MemoryRouter><DayTile day={many(3)} {...handlers} /></MemoryRouter>)
    expect(screen.getByRole('article')).toHaveAttribute('data-dividers', 'true')
  })
})
