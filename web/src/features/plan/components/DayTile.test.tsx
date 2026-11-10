import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { groupByDay } from '../lib/days'
import { slot } from '../test-utils'
import { DayTile } from './DayTile'

const handlers = { onOpen: vi.fn(), onSwap: vi.fn(), onChoose: vi.fn(), onCook: vi.fn(), today: '2026-11-09' }

describe('DayTile', () => {
  const days = groupByDay(
    [
      slot({ date: '2026-11-09', mealSlotId: 1, name: 'Lunch', time: '12:30' }),
      slot({ date: '2026-11-09', mealSlotId: 2 }),
      slot({ date: '2026-11-10', mealSlotId: 2 }),
      slot({ date: '2026-11-11', mealSlotId: 2 }),
    ],
    '2026-11-09',
  )

  it("today's tile spans two columns and carries the accent ring flag, not a different fill", () => {
    render(<DayTile day={days[0]!} {...handlers} />)
    const tile = screen.getByRole('article')
    expect(tile).toHaveAttribute('data-span', '2')
    expect(tile).toHaveAttribute('data-today', 'true')
    expect(tile).toHaveAttribute('data-variant', 'surface')
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Chicken curry/ })).toHaveLength(2)
  })

  it('other days take one column and are not marked today', () => {
    render(<DayTile day={days[1]!} {...handlers} />)
    const tile = screen.getByRole('article')
    expect(tile).toHaveAttribute('data-span', '1')
    expect(tile).not.toHaveAttribute('data-today')
    expect(screen.getByRole('heading', { name: 'Tomorrow' })).toBeInTheDocument()
  })

  it('shows the date overline "TUE 10" and, two days out, the weekday as the heading', () => {
    const { unmount } = render(<DayTile day={days[1]!} {...handlers} />)
    expect(screen.getByText('TUE 10')).toBeInTheDocument()
    unmount()
    render(<DayTile day={days[2]!} {...handlers} />)
    expect(screen.getByText('WED 11')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Wednesday' })).toBeInTheDocument()
  })
})
