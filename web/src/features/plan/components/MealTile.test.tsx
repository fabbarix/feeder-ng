import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { favourite, meal, slot } from '../test-utils'
import { MealTile } from './MealTile'

function setup(s = slot()) {
  const handlers = { onSwap: vi.fn(), onChoose: vi.fn(), onConfirm: vi.fn(), onUnpin: vi.fn(), onMarkCooked: vi.fn() }
  render(<MealTile slot={s} {...handlers} />)
  return handlers
}

const key = { date: '2026-11-10', mealSlotId: 2 }

describe('MealTile', () => {
  it('shows the Recipe, Meal Slot, time, Batches and portions', () => {
    setup(slot({ meal: meal({ batches: 2, portions: 3.5 }) }))
    expect(screen.getByText('Chicken curry')).toBeInTheDocument()
    expect(screen.getByText(/Dinner/)).toBeInTheDocument()
    expect(screen.getByText(/19:00/)).toBeInTheDocument()
    expect(screen.getByText('2 Batches')).toBeInTheDocument()
    expect(screen.getByText('3.5 portions')).toBeInTheDocument()
  })

  it('phrases the why chips for people, at most three', () => {
    setup(slot({
      meal: meal({
        why: [
          favourite('Anna'),
          { code: 'perishable_use', ingredient: 'spinach', date: '2026-11-12' },
          { code: 'ingredient_overlap', ingredient: 'chicken', date: '2026-11-09' },
          { code: 'stock_coverage' },
        ],
      }),
    }))
    expect(screen.getByText("Anna's favourite")).toBeInTheDocument()
    expect(screen.getByText('spinach goes off Thu')).toBeInTheDocument()
    expect(screen.getByText("uses Monday's chicken")).toBeInTheDocument()
    expect(screen.queryByText('already in Stock')).not.toBeInTheDocument()
  })

  it('an unpinned meal offers Swap, Confirm and Mark as Cooked, and each reports the slot', async () => {
    const h = setup()
    expect(screen.queryByRole('button', { name: 'Unpin' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Swap' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mark as Cooked' }))
    expect(h.onSwap).toHaveBeenCalledWith(key)
    expect(h.onConfirm).toHaveBeenCalledWith(key)
    expect(h.onMarkCooked).toHaveBeenCalledWith(key)
  })

  it('a Pinned meal shows a Pinned chip and Unpin instead of Confirm', async () => {
    const h = setup(slot({ meal: meal({ pinned: true }) }))
    expect(screen.getByText('Pinned')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Unpin' }))
    expect(h.onUnpin).toHaveBeenCalledWith(key)
  })

  it('a meal served from a Leftover says where it comes from, in the Leftover tone', () => {
    setup(slot({ meal: meal({ servedFromLeftover: { leftoverId: 5, date: '2026-11-09', mealSlotId: 2, recipeName: 'Chicken curry' } }) }))
    const chip = screen.getByText('Leftover from Monday')
    expect(chip.closest('[data-tone]')).toHaveAttribute('data-tone', 'leftover')
    expect(screen.queryByText(/Batch/)).not.toBeInTheDocument()
  })

  it('a Cooked meal has no actions, only its state', () => {
    setup(slot({ meal: meal({ state: 'cooked', pinned: true }) }))
    expect(screen.getByText('Cooked')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('a skipped meal says Not cooked and has no actions', () => {
    setup(slot({ meal: meal({ state: 'skipped' }) }))
    expect(screen.getByText('Not cooked')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('an empty slot explains why and offers to choose a Recipe', async () => {
    const h = setup(slot({
      date: '2026-11-12', meal: null,
      unfilled: { reason: 'no_candidates', slotRuleClaimed: false, eliminated: { considered: 3, exclusion: 1, coolDown: 2, varietyRule: 0, advanceStep: 0 } },
    }))
    expect(screen.getByText("Couldn't plan Thursday dinner: every option was excluded or in Cool-down.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Choose a Recipe' }))
    expect(h.onChoose).toHaveBeenCalledWith({ date: '2026-11-12', mealSlotId: 2 })
  })

  it('a slot with nothing planned and no reason just says so', () => {
    setup(slot({ meal: null }))
    expect(screen.getByText('Nothing planned')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose a Recipe' })).toBeInTheDocument()
  })
})
