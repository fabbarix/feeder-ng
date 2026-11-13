// B5-F1 (ADR 0014): the board's Tonight and Tomorrow tiles for a Meal Slot that is Not served.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SlotLike } from '../types'
import { TomorrowTile, TonightTile } from './BoardTiles'

const notServed = (over: Partial<SlotLike> = {}): SlotLike => ({
  date: '2026-11-09', mealSlotId: 2, name: 'Dinner', time: '19:30', at: '2026-11-09T19:30:00Z', notServed: true,
  courses: [{ courseId: 1, name: 'Main', main: true, meal: null, unserved: 'not_served' }], ...over,
})

describe('TonightTile: Not served', () => {
  it('says "Dinner · Not served" instead of "Nothing planned tonight"', () => {
    render(<TonightTile slot={null} notServed={[notServed()]} />)
    expect(screen.getByText('Dinner · Not served')).toBeInTheDocument()
    expect(screen.queryByText('Nothing planned tonight')).not.toBeInTheDocument()
  })

  it('has no Cook button for it', () => {
    render(<TonightTile slot={null} notServed={[notServed()]} onCook={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Cook' })).not.toBeInTheDocument()
  })

  it('still says "Nothing planned tonight" when nothing is Not served either', () => {
    render(<TonightTile slot={null} notServed={[]} />)
    expect(screen.getByText('Nothing planned tonight')).toBeInTheDocument()
  })

  it('a planned meal tonight still shows as before', () => {
    const lunch: SlotLike = { date: '2026-11-09', mealSlotId: 1, name: 'Lunch', time: '20:15', at: '2026-11-09T20:15:00Z', courses: [{ courseId: 1, name: 'Main', main: true, meal: { recipeId: 7, recipeName: 'Soup', batches: 1, portions: 4, state: 'planned' } }] }
    render(<TonightTile slot={lunch} notServed={[notServed()]} />)
    expect(screen.getByText('Soup')).toBeInTheDocument()
    expect(screen.getByText('Lunch · 20:15')).toBeInTheDocument()
  })
})

describe('TomorrowTile: Not served', () => {
  it('lists "Dinner · Not served" with no Not planned chip', () => {
    render(<TomorrowTile slots={[notServed({ date: '2026-11-10' })]} />)
    const tile = screen.getByRole('heading', { name: 'Tomorrow' }).closest('section') as HTMLElement
    expect(within(tile).getByText('Dinner · Not served')).toBeInTheDocument()
    expect(within(tile).queryByText('Not planned')).not.toBeInTheDocument()
  })
})
