// B9-32 (PC-11): a day tile spans the tracks it is given, and a day that has the whole row says so (data-row) so its Meal Slots lie side by side.
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { groupByDay } from '../lib/days'
import { slot } from '../test-utils'
import { DayTile } from './DayTile'

const handlers = { onOpen: vi.fn(), onSwap: vi.fn(), onChoose: vi.fn(), onCook: vi.fn(), today: '2026-11-09' }
const days = groupByDay([slot({ date: '2026-11-10', mealSlotId: 1, name: 'Breakfast', time: '08:00' }), slot({ date: '2026-11-10', mealSlotId: 2 })], '2026-11-09')
const view = (props: { span?: number; wholeRow?: boolean }) => render(<MemoryRouter><DayTile day={days[0]!} {...handlers} {...props} /></MemoryRouter>)

describe('DayTile in the 12-track week grid', () => {
  it('spans the tracks it is given (an inline grid-column, so it works for any column count and horizon)', () => {
    view({ span: 4 })
    expect(screen.getByRole('article').style.gridColumn).toBe('span 4')
  })

  it('without a span it sets no grid-column (Today and the other screens keep working)', () => {
    view({})
    expect(screen.getByRole('article').style.gridColumn).toBe('')
  })

  it('a day with the whole row is data-row="true": its Meal Slots are laid out side by side', () => {
    view({ span: 12, wholeRow: true })
    const tile = screen.getByRole('article')
    expect(tile).toHaveAttribute('data-row', 'true')
    expect(tile.querySelectorAll('.plan-meal')).toHaveLength(2)
  })

  it('an ordinary day, and a single-column day, is not data-row', () => {
    view({ span: 12, wholeRow: false })
    expect(screen.getByRole('article')).not.toHaveAttribute('data-row')
  })

  it('reading order inside a full-row day is unchanged: Breakfast, then Dinner', () => {
    view({ span: 12, wholeRow: true })
    expect([...screen.getByRole('article').querySelectorAll('.plan-slot-head__name')].map((e) => e.textContent)).toEqual(['Breakfast', 'Dinner'])
  })
})
