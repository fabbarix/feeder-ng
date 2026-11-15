import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubViewportWidth } from '../../../ui/lib/viewport.test-helper'
import { favourite, meal, slot } from '../test-utils'
import type { PlanSlot } from '../types'
import { PlannedMealSheet } from './PlannedMealSheet'

afterEach(() => vi.unstubAllGlobals())

const slotKey = { date: '2026-11-10', mealSlotId: 2 }
const key = { ...slotKey, courseId: 1 }

function setup(s: PlanSlot | null = slot(), today = '2026-11-10') {
  const h = { onClose: vi.fn(), onCook: vi.fn(), onMarkCooked: vi.fn(), onSwap: vi.fn(), onPin: vi.fn(), onUnpin: vi.fn(), onChoose: vi.fn() }
  render(<PlannedMealSheet open slot={s} courseId={1} today={today} {...h} />)
  return h
}

const buttonNames = () => within(screen.getByRole('dialog')).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)

describe('PlannedMealSheet', () => {
  it('is titled with the Recipe under the context line (day, Meal Slot and time, B9-38) and shows the facts', () => {
    setup(slot({ meal: meal({ batches: 1, portions: 3.5 }) }))
    expect(screen.getByRole('dialog', { name: 'Tue 10 · Dinner 19:00 Chicken curry' })).toBeInTheDocument()
    expect(screen.getByText('Tue 10 · Dinner 19:00')).toBeInTheDocument()
    expect(screen.getByText('1 Batch · 3.5 portions')).toBeInTheDocument()
  })

  it('shows only the portions, no Batch count, for a meal served from a Leftover (it needs no cooking, §5)', () => {
    setup(slot({ meal: meal({ batches: 0, portions: 2.75, servedFromLeftover: { leftoverId: 4, date: '2026-11-08', mealSlotId: 2, recipeName: 'Chicken curry' } }) }))
    expect(screen.getByText('2.75 portions')).toBeInTheDocument()
    expect(screen.queryByText(/Batch/)).not.toBeInTheDocument()
  })

  it('shows the Attendance avatars when the slot has them', () => {
    setup(slot({ attendance: [{ id: 1, name: 'Anna' }, { id: 2, name: 'Ben' }] }))
    expect(screen.getByRole('img', { name: 'Anna' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Ben' })).toBeInTheDocument()
  })

  it('shows up to three chips and the rest as a count chip', () => {
    setup(slot({
      meal: meal({
        pinned: true,
        why: [favourite('Anna'), { code: 'perishable_use', ingredient: 'spinach', date: '2026-11-12' }, { code: 'ingredient_overlap', ingredient: 'chicken', date: '2026-11-09' }],
      }),
    }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('Pinned')).toBeInTheDocument()
    expect(dialog.getByText("Anna's favourite")).toBeInTheDocument()
    expect(dialog.getByText('uses spinach by Thu')).toBeInTheDocument()
    expect(dialog.queryByText("uses Monday's chicken")).not.toBeInTheDocument()
    expect(dialog.getByText('+1')).toBeInTheDocument()
  })

  it("today's planned meal: the footer is ⋮, Mark as Cooked, Cook (B9-38: one row; Swap, Pin and Choose a Recipe are under ⋮)", () => {
    setup()
    expect(buttonNames().filter((n) => n !== 'Close')).toEqual(['More for Tue Dinner', 'Mark as Cooked', 'Cook'])
    expect(screen.getByRole('button', { name: 'Cook' })).toHaveAttribute('data-variant', 'primary')
    expect(screen.getByRole('button', { name: 'Mark as Cooked' })).toHaveAttribute('data-variant', 'secondary')
  })

  it('each action reports the slot', async () => {
    stubViewportWidth(1024)
    const h = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Cook' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mark as Cooked' }))
    await userEvent.click(screen.getByRole('button', { name: 'More for Tue Dinner' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Swap' }))
    await userEvent.click(screen.getByRole('button', { name: 'More for Tue Dinner' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Pin' }))
    await userEvent.click(screen.getByRole('button', { name: 'More for Tue Dinner' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Choose a Recipe' }))
    expect(h.onCook).toHaveBeenCalledWith(slotKey)
    expect(h.onMarkCooked).toHaveBeenCalledWith(key)
    expect(h.onSwap).toHaveBeenCalledWith(key)
    expect(h.onPin).toHaveBeenCalledWith(key)
    expect(h.onChoose).toHaveBeenCalledWith(key)
  })

  it('a Pinned meal offers Unpin instead of Pin', async () => {
    stubViewportWidth(1024)
    const h = setup(slot({ meal: meal({ pinned: true }) }))
    await userEvent.click(screen.getByRole('button', { name: 'More for Tue Dinner' }))
    expect(screen.queryByRole('menuitem', { name: 'Pin' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Unpin' }))
    expect(h.onUnpin).toHaveBeenCalledWith(key)
  })

  it('B10/B2 (PC 4, B9-38): a future meal has Cook and Swap; Mark as Cooked is a disabled ⋮ item, "from Wed 11"', async () => {
    stubViewportWidth(1024)
    setup(slot({ date: '2026-11-11', meal: meal({ date: '2026-11-11' }) }), '2026-11-10')
    expect(screen.queryByRole('button', { name: 'Mark as Cooked' })).not.toBeInTheDocument()
    expect(buttonNames().filter((n) => n !== 'Close')).toEqual(['More for Wed Dinner', 'Swap', 'Cook'])
    await userEvent.click(screen.getByRole('button', { name: 'More for Wed Dinner' }))
    expect(screen.getByRole('menuitem', { name: 'Mark as Cooked · from Wed 11' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('a past planned meal still waiting can be Marked as Cooked but not cooked in Cook Mode', () => {
    setup(slot({ date: '2026-11-08', meal: meal({ date: '2026-11-08' }) }), '2026-11-10')
    expect(screen.queryByRole('button', { name: 'Cook' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark as Cooked' })).toBeInTheDocument()
  })

  it('a Cooked meal has no actions', () => {
    setup(slot({ meal: meal({ state: 'cooked' }) }))
    expect(buttonNames()).toEqual(['Close'])
    expect(screen.getByText('Cooked')).toBeInTheDocument()
  })

  it('renders nothing while closed or without a slot', () => {
    const { rerender } = render(<PlannedMealSheet open={false} slot={slot()} courseId={1} today="2026-11-10" onClose={() => {}} onCook={() => {}} onMarkCooked={() => {}} onSwap={() => {}} onPin={() => {}} onUnpin={() => {}} onChoose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    rerender(<PlannedMealSheet open slot={null} courseId={1} today="2026-11-10" onClose={() => {}} onCook={() => {}} onMarkCooked={() => {}} onSwap={() => {}} onPin={() => {}} onUnpin={() => {}} onChoose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
