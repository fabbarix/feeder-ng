import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { groupByDay } from '../lib/days'
import { slot } from '../test-utils'
import { DayTile } from './DayTile'

const handlers = { onSwap: vi.fn(), onChoose: vi.fn(), onConfirm: vi.fn(), onUnpin: vi.fn(), onMarkCooked: vi.fn(), today: '2026-11-09' }

describe('DayTile', () => {
  const days = groupByDay(
    [
      slot({ date: '2026-11-09', mealSlotId: 1, name: 'Lunch', time: '12:30' }),
      slot({ date: '2026-11-09', mealSlotId: 2 }),
      slot({ date: '2026-11-10', mealSlotId: 2 }),
    ],
    '2026-11-09',
  )

  it("today's tile spans both columns", () => {
    render(<DayTile day={days[0]!} {...handlers} />)
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('article')).toHaveAttribute('data-size', 'full')
    expect(screen.getAllByText('Chicken curry')).toHaveLength(2)
  })

  it('other days take one column', () => {
    render(<DayTile day={days[1]!} {...handlers} />)
    expect(screen.getByRole('heading', { name: 'Tomorrow' })).toBeInTheDocument()
    expect(screen.getByRole('article')).toHaveAttribute('data-size', 'md')
  })
})
