import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { favourite, meal, slot } from '../test-utils'
import type { PlanSlot } from '../types'
import { PlannedMealSheet } from './PlannedMealSheet'

const key = { date: '2026-11-10', mealSlotId: 2 }

function setup(s: PlanSlot | null = slot(), today = '2026-11-10') {
  const h = { onClose: vi.fn(), onCook: vi.fn(), onMarkCooked: vi.fn(), onSwap: vi.fn(), onPin: vi.fn(), onUnpin: vi.fn(), onChoose: vi.fn() }
  render(<PlannedMealSheet open slot={s} today={today} {...h} />)
  return h
}

const buttonNames = () => within(screen.getByRole('dialog')).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)

describe('PlannedMealSheet', () => {
  it('is titled with the Recipe and shows the Meal Slot, time and the facts as a meta line', () => {
    setup(slot({ meal: meal({ batches: 1, portions: 3.5 }) }))
    expect(screen.getByRole('dialog', { name: 'Chicken curry' })).toBeInTheDocument()
    expect(screen.getByText('Dinner · 19:00')).toBeInTheDocument()
    expect(screen.getByText('1 Batch · 3.5 portions')).toBeInTheDocument()
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
    expect(dialog.getByText('uses spinach before Thu')).toBeInTheDocument()
    expect(dialog.queryByText("uses Monday's chicken")).not.toBeInTheDocument()
    expect(dialog.getByText('+2')).toBeInTheDocument()
  })

  it("today's planned meal offers the full action set in order: Cook, Mark as Cooked, Swap, Pin, Choose a Recipe", () => {
    setup()
    expect(buttonNames().filter((n) => n !== 'Close')).toEqual(['Cook', 'Mark as Cooked', 'Swap', 'Pin', 'Choose a Recipe'])
    expect(screen.getByRole('button', { name: 'Cook' })).toHaveAttribute('data-variant', 'primary')
    expect(screen.getByRole('button', { name: 'Mark as Cooked' })).toHaveAttribute('data-variant', 'secondary')
  })

  it('each action reports the slot', async () => {
    const h = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Cook' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mark as Cooked' }))
    await userEvent.click(screen.getByRole('button', { name: 'Swap' }))
    await userEvent.click(screen.getByRole('button', { name: 'Pin' }))
    await userEvent.click(screen.getByRole('button', { name: 'Choose a Recipe' }))
    expect(h.onCook).toHaveBeenCalledWith(key)
    expect(h.onMarkCooked).toHaveBeenCalledWith(key)
    expect(h.onSwap).toHaveBeenCalledWith(key)
    expect(h.onPin).toHaveBeenCalledWith(key)
    expect(h.onChoose).toHaveBeenCalledWith(key)
  })

  it('a Pinned meal offers Unpin instead of Pin', async () => {
    const h = setup(slot({ meal: meal({ pinned: true }) }))
    expect(screen.queryByRole('button', { name: 'Pin' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Unpin' }))
    expect(h.onUnpin).toHaveBeenCalledWith(key)
  })

  it('B10/B2: a future meal has neither Cook nor Mark as Cooked', () => {
    setup(slot({ date: '2026-11-11', meal: meal({ date: '2026-11-11' }) }), '2026-11-10')
    expect(screen.queryByRole('button', { name: 'Cook' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as Cooked' })).not.toBeInTheDocument()
    expect(buttonNames().filter((n) => n !== 'Close')).toEqual(['Swap', 'Pin', 'Choose a Recipe'])
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
    const { rerender } = render(<PlannedMealSheet open={false} slot={slot()} today="2026-11-10" onClose={() => {}} onCook={() => {}} onMarkCooked={() => {}} onSwap={() => {}} onPin={() => {}} onUnpin={() => {}} onChoose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    rerender(<PlannedMealSheet open slot={null} today="2026-11-10" onClose={() => {}} onCook={() => {}} onMarkCooked={() => {}} onSwap={() => {}} onPin={() => {}} onUnpin={() => {}} onChoose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
