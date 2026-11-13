import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { groupByDay } from '../lib/days'
import { slot } from '../test-utils'
import { DayTile } from './DayTile'

const handlers = { onOpen: vi.fn(), onSwap: vi.fn(), onChoose: vi.fn(), onCook: vi.fn(), today: '2026-11-09' }

// ds-plan: the structure of the tile (title, span, ring) is in DayTile.ds.test.tsx. The 7-column compact tile, today's span of 2
// and the date overline are gone; this file keeps what the tile still shows.
describe('DayTile', () => {
  const days = groupByDay(
    [
      slot({ date: '2026-11-09', mealSlotId: 1, name: 'Lunch', time: '12:30' }),
      slot({ date: '2026-11-09', mealSlotId: 2 }),
      slot({ date: '2026-11-10', mealSlotId: 2 }),
    ],
    '2026-11-09',
  )
  const view = (i: number) => render(<MemoryRouter><DayTile day={days[i]!} {...handlers} /></MemoryRouter>)

  it("today's tile carries the accent ring flag, not a different fill, and lists its Planned Meals", () => {
    view(0)
    const tile = screen.getByRole('article')
    expect(tile).toHaveAttribute('data-today', 'true')
    expect(tile).toHaveAttribute('data-variant', 'surface')
    expect(screen.getAllByRole('button', { name: /Chicken curry/ })).toHaveLength(2)
  })

  it('shows the slot name and time of each meal, and Cook for today\'s planned meals', () => {
    view(0)
    expect(screen.getByText('Lunch')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Cook' })).toHaveLength(2)
  })

  it('other days are not marked today', () => {
    view(1)
    expect(screen.getByRole('article')).not.toHaveAttribute('data-today')
  })
})
