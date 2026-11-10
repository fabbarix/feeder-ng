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

  it('compact (7 columns) uses the short weekday as heading, never the long one', () => {
    render(<DayTile day={days[2]!} compact {...handlers} />)
    expect(screen.getByRole('heading', { name: 'Wed' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Wednesday' })).not.toBeInTheDocument()
  })

  it('compact keeps Today / Tomorrow in full and the ring flag on a one-column today', () => {
    const week = groupByDay([slot({ date: '2026-11-09', mealSlotId: 2 }), slot({ date: '2026-11-10', mealSlotId: 2 })], '2026-11-09', 7)
    render(<DayTile day={week[0]!} compact {...handlers} />)
    const tile = screen.getByRole('article')
    expect(tile).toHaveAttribute('data-span', '1')
    expect(tile).toHaveAttribute('data-today', 'true')
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
  })

  it('the divider flag appears only with 3 or more meals', () => {
    const many = (n: number) =>
      groupByDay(Array.from({ length: n }, (_, i) => slot({ date: '2026-11-10', mealSlotId: i + 1, name: `Slot ${i + 1}`, time: `${8 + i * 4}:00` })), '2026-11-09')[0]!
    const { unmount } = render(<DayTile day={many(2)} {...handlers} />)
    expect(screen.getByRole('article')).not.toHaveAttribute('data-dividers')
    unmount()
    render(<DayTile day={many(3)} {...handlers} />)
    expect(screen.getByRole('article')).toHaveAttribute('data-dividers', 'true')
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
