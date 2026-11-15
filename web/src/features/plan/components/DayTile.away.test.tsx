// B9-46 (PC-08): what a day tile says about Aways. A whole-day Away is one line under the day's name (a button that opens that Away);
// a part-day Away labels the Meal Slots it covers; a slot where everyone is away says so.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { groupByDay } from '../lib/days'
import { slot } from '../test-utils'
import type { Away } from '../types'
import { DayTile } from './DayTile'

const ben: Away = { id: 9, memberId: 2, memberName: 'Ben', from: '2026-11-17', fromMealSlotId: null, through: '2026-11-19', throughMealSlotId: null, started: false }
const chiara: Away = { ...ben, id: 10, memberId: 3, memberName: 'Chiara' }
const handlers = { onOpen: vi.fn(), onSwap: vi.fn(), onChoose: vi.fn(), onCook: vi.fn(), today: '2026-11-15' }
const day = (slots: Parameters<typeof slot>[0][]) => groupByDay(slots.map((s) => slot(s)), '2026-11-15')[0]!
const render1 = (d: ReturnType<typeof day>, aways: Away[], onAway = vi.fn()) => {
  render(
    <MemoryRouter>
      <DayTile day={d} aways={aways} onAway={onAway} {...handlers} />
    </MemoryRouter>,
  )
  return onAway
}
const wholeDay = day([
  { date: '2026-11-17', mealSlotId: 1, name: 'Breakfast', time: '08:30', portions: 1.75, away: [2] },
  { date: '2026-11-17', mealSlotId: 2, name: 'Lunch', time: '13:00', portions: 1.75, away: [2] },
  { date: '2026-11-17', mealSlotId: 3, name: 'Dinner', time: '19:00', portions: 3.75, guests: 2, away: [2] },
])

describe('DayTile: a whole-day Away', () => {
  it('is one line under the day name, in the info tone, as a button named with the day', () => {
    render1(wholeDay, [ben])
    const line = screen.getByRole('button', { name: 'Ben away all day · 1.75 portions, Tue 17' })
    expect(line).toHaveTextContent('Ben away all day · 1.75 portions')
    expect(line.closest('article')).not.toBeNull()
    // Under the title, before the first Meal Slot.
    const tile = screen.getByRole('article')
    expect(tile.querySelector('.plan-day__title')!.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(line.compareDocumentPosition(tile.querySelector('.plan-meal')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(line).toHaveClass('plan-day__away')
  })

  it('opens that Away', async () => {
    const onAway = render1(wholeDay, [ben])
    await userEvent.click(screen.getByRole('button', { name: /^Ben away all day/ }))
    expect(onAway).toHaveBeenCalledWith(ben)
  })

  it('the Meal Slots under it do not repeat "Ben away"', () => {
    render1(wholeDay, [ben])
    expect(within(screen.getByRole('article')).getAllByText(/Ben away/)).toHaveLength(1)
  })

  it('two Members away all day: a line each, each opening its own Away', async () => {
    const both = day([{ date: '2026-11-17', mealSlotId: 3, portions: 1, away: [2, 3] }])
    const onAway = render1(both, [ben, chiara])
    expect(screen.getAllByRole('button', { name: /away all day/ }).map((b) => b.textContent)).toEqual(['Ben away all day · 1 portion', 'Chiara away all day · 1 portion'])
    await userEvent.click(screen.getByRole('button', { name: /^Chiara away all day/ }))
    expect(onAway).toHaveBeenCalledWith(chiara)
  })
})

describe('DayTile: a part-day Away and everyone away', () => {
  it('"Ben away" sits in the header of the Meal Slot it covers, and only there', () => {
    const part = day([
      { date: '2026-11-17', mealSlotId: 2, name: 'Lunch', time: '13:00' },
      { date: '2026-11-17', mealSlotId: 3, name: 'Dinner', time: '19:00', away: [2] },
    ])
    render1(part, [ben])
    expect(screen.queryByRole('button', { name: /away all day/ })).toBeNull()
    const meals = screen.getByRole('article').querySelectorAll('.plan-meal')
    expect(within(meals[0] as HTMLElement).queryByText(/Ben away/)).toBeNull()
    expect(within(meals[1] as HTMLElement).getByText('Ben away')).toBeInTheDocument()
    expect(within(meals[1] as HTMLElement).getByText('Ben away').closest('.plan-slot-head')).not.toBeNull()
  })

  it('a slot where everyone is away shows the info chip "Everyone is away"', () => {
    const none = day([{ date: '2026-11-17', mealSlotId: 3, name: 'Dinner', away: [2, 3], everyoneAway: true }])
    render1(none, [ben, chiara])
    const chip = screen.getByText('Everyone is away')
    expect(chip.closest('.plan-slot-head')).not.toBeNull()
    expect(chip.closest('[data-tone]')).toHaveAttribute('data-tone', 'info')
  })

  it('a day with no Away has no Away line and no label', () => {
    render1(day([{ date: '2026-11-17', mealSlotId: 3 }]), [ben])
    expect(screen.queryByText(/away/i)).toBeNull()
  })
})
