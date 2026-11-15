// B9-46 (PC-08): the Meal Slot ⋮ offers "Someone is away…", which opens the Away sheet from that Meal Slot.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { slot } from '../test-utils'
import type { PlanSlot, SlotDateActions } from '../types'
import { SlotMenu } from './SlotMenu'

const TODAY = '2026-11-10'
function setup(s: PlanSlot, over: Partial<SlotDateActions> = {}) {
  const date: SlotDateActions = { offline: false, onWhosEating: vi.fn(), onNotServed: vi.fn(), onTime: vi.fn(), onPlanAgain: vi.fn(), onAway: vi.fn(), ...over }
  render(
    <MemoryRouter>
      <SlotMenu slot={s} today={TODAY} dateActions={date} onMarkAllCooked={vi.fn()} onNotCookedSlot={vi.fn()} onAddCourse={vi.fn()} />
    </MemoryRouter>,
  )
  return date
}
const items = () => screen.getAllByRole('menuitem').map((i) => i.textContent)
const open = () => userEvent.click(screen.getByRole('button', { name: 'Dinner actions' }))

describe('SlotMenu: Someone is away…', () => {
  it('comes right after Who\'s eating', async () => {
    setup(slot({ date: TODAY }))
    await open()
    expect(items()).toEqual(["Who's eating", 'Someone is away…', 'Time today', 'Not served'])
  })

  it('calls onAway with the slot', async () => {
    const date = setup(slot({ date: TODAY }))
    await open()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Someone is away…' }))
    expect(date.onAway).toHaveBeenCalledWith({ date: TODAY, mealSlotId: 2 })
  })

  it('offline it is unavailable, as the other per-date choices are', async () => {
    setup(slot({ date: TODAY }), { offline: true })
    await open()
    const item = screen.getByRole('menuitem', { name: /Someone is away…/ })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    expect(item.textContent).toMatch(/Needs a connection/)
  })

  it('without an onAway handler the menu is as it was', async () => {
    setup(slot({ date: TODAY }), { onAway: undefined })
    await open()
    expect(items()).toEqual(["Who's eating", 'Time today', 'Not served'])
  })
})
