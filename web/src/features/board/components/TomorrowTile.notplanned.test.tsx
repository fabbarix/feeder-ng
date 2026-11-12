import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SlotLike } from '../types'
import { TomorrowTile } from './BoardTiles'

const planned: SlotLike = { date: '2026-11-10', mealSlotId: 2, name: 'Dinner', time: '19:00', at: '2026-11-10T19:00:00Z', courses: [{ courseId: 1, name: 'Main', main: true, meal: { recipeId: 2, recipeName: 'Pasta', batches: 1, portions: 4, state: 'planned' } }] }
const empty: SlotLike = { date: '2026-11-10', mealSlotId: 1, name: 'Lunch', time: '12:00', at: '2026-11-10T12:00:00Z', courses: [{ courseId: 1, name: 'Main', main: true, meal: null, unfilled: { reason: 'no_attendance' } }] }

describe('TomorrowTile: Couldn\'t plan on the board', () => {
  it('shows a slot the planner could not plan as a neutral "Not planned" chip, not a sentence and not danger', () => {
    const { container } = render(<TomorrowTile slots={[empty, planned]} />)
    expect(screen.getByText('Lunch')).toBeInTheDocument()
    const chip = screen.getByText('Not planned').closest('.chip')!
    expect(chip).toHaveAttribute('data-kind', 'tag')
    expect(container.querySelector('[data-status="danger"]')).toBeNull()
    expect(screen.getByText('Dinner · Pasta')).toBeInTheDocument()
    expect(screen.queryByText(/Couldn't plan/)).not.toBeInTheDocument()
  })

  it('the board is read-only: no buttons, no links', () => {
    render(<TomorrowTile slots={[empty]} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('a day where nothing could be planned is not "Nothing planned tomorrow" but says why', () => {
    render(<TomorrowTile slots={[empty]} />)
    expect(screen.queryByText('Nothing planned tomorrow')).not.toBeInTheDocument()
  })
})
