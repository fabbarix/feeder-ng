import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { favourite, meal, slot } from '../test-utils'
import { MealTile } from './MealTile'

function setup(s = slot(), today = '2026-11-10') {
  const handlers = { onOpen: vi.fn(), onSwap: vi.fn(), onChoose: vi.fn(), onCook: vi.fn() }
  const view = render(<MealTile slot={s} today={today} {...handlers} />)
  return { ...handlers, container: view.container }
}

const key = { date: '2026-11-10', mealSlotId: 2 }
const chipsOf = (container: HTMLElement) => container.querySelectorAll('.chip')

describe('MealTile (compact, on a day tile)', () => {
  it('shows the Meal Slot and the Recipe name, no times, Batches or portions', () => {
    setup(slot({ meal: meal({ batches: 2, portions: 3.5 }) }))
    expect(screen.getByText('Dinner')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Chicken curry/ })).toBeInTheDocument()
    expect(screen.queryByText(/19:00/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Batch/)).not.toBeInTheDocument()
    expect(screen.queryByText(/portions/)).not.toBeInTheDocument()
  })

  it('at most ONE chip, however many reasons the planner gave', () => {
    const { container } = setup(slot({
      meal: meal({
        pinned: true,
        why: [favourite('Anna'), { code: 'perishable_use', ingredient: 'spinach', date: '2026-11-12' }, { code: 'ingredient_overlap', ingredient: 'chicken', date: '2026-11-09' }],
      }),
    }))
    expect(chipsOf(container)).toHaveLength(1)
  })

  it('the chip is a meaning chip (data-kind), never a legacy tone chip that loses its background', () => {
    const { container } = setup(slot({ meal: meal({ why: [favourite('Anna')] }) }))
    const chip = container.querySelector('.chip')!
    expect(chip).toHaveAttribute('data-kind', 'why')
    expect(chip).not.toHaveAttribute('data-tone')
    expect(chip).toHaveTextContent("Anna's favourite")
  })

  it('a Pinned meal shows the Pinned state chip', () => {
    const { container } = setup(slot({ meal: meal({ pinned: true, why: [favourite('Anna')] }) }))
    expect(container.querySelector('.chip')).toHaveAttribute('data-kind', 'state')
    expect(container.querySelector('.chip')).toHaveTextContent('Pinned')
  })

  it('the "best available" reason is not shown at all', () => {
    const { container } = setup(slot({ meal: meal({ why: [{ code: 'best_available' }] }) }))
    expect(screen.queryByText('best available')).not.toBeInTheDocument()
    expect(chipsOf(container)).toHaveLength(0)
  })

  it('a meal served from a Leftover says it ONCE: "Leftover from Mon"', () => {
    const { container } = setup(slot({
      meal: meal({
        servedFromLeftover: { leftoverId: 5, date: '2026-11-09', mealSlotId: 2, recipeName: 'Chicken curry' },
        why: [{ code: 'leftover', date: '2026-11-09' }],
      }),
    }))
    expect(screen.getAllByText(/Leftover from/i)).toHaveLength(1)
    expect(screen.getByText('Leftover from Mon')).toBeInTheDocument()
    expect(chipsOf(container)).toHaveLength(1)
    expect(container.querySelector('.chip')).toHaveAttribute('data-status', 'leftover')
  })

  it('tapping the Recipe name opens the Planned Meal sheet for the slot', async () => {
    const h = setup()
    await userEvent.click(screen.getByRole('button', { name: /Chicken curry/ }))
    expect(h.onOpen).toHaveBeenCalledWith(key)
  })

  it('a planned meal has a compact Swap icon button, labelled', async () => {
    const h = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Swap' }))
    expect(h.onSwap).toHaveBeenCalledWith(key)
  })

  it('has no Confirm, Pin, Unpin or Mark as Cooked buttons: those live in the sheet', () => {
    setup()
    for (const name of ['Confirm', 'Pin', 'Unpin', 'Mark as Cooked']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  describe('B2: Cook Mode from the tile', () => {
    it("today's planned meal has a Cook icon button", async () => {
      const h = setup()
      await userEvent.click(screen.getByRole('button', { name: 'Cook' }))
      expect(h.onCook).toHaveBeenCalledWith(key)
    })

    it('a future meal has none', () => {
      setup(slot({ date: '2026-11-11', meal: meal({ date: '2026-11-11' }) }), '2026-11-10')
      expect(screen.queryByRole('button', { name: 'Cook' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Swap' })).toBeInTheDocument()
    })

    it("a past meal has none, nor Swap", () => {
      setup(slot({ date: '2026-11-08', meal: meal({ date: '2026-11-08', state: 'cooked' }) }), '2026-11-10')
      expect(screen.queryByRole('button', { name: 'Cook' })).not.toBeInTheDocument()
    })
  })

  it('a Cooked meal is muted, shows only Cooked, and has no icon buttons', () => {
    const { container } = setup(slot({ meal: meal({ state: 'cooked', pinned: true }) }))
    expect(container.querySelector('[data-state="cooked"]')).not.toBeNull()
    expect(screen.getByText('Cooked')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Swap' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cook' })).not.toBeInTheDocument()
    expect(chipsOf(container)).toHaveLength(1)
  })

  it('a Not cooked meal says so and has no icon buttons', () => {
    setup(slot({ meal: meal({ state: 'skipped' }) }))
    expect(screen.getByText('Not cooked')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Swap' })).not.toBeInTheDocument()
  })

  it("an empty slot is a dashed block with a danger chip, the reason and a tertiary Choose a Recipe", async () => {
    const h = setup(slot({
      date: '2026-11-12', meal: null,
      unfilled: { reason: 'no_candidates', slotRuleClaimed: false, eliminated: { considered: 3, exclusion: 1, coolDown: 2, varietyRule: 0, advanceStep: 0 } },
    }))
    const block = screen.getByText("Couldn't plan").closest('[data-unfilled]') as HTMLElement
    expect(block).not.toBeNull()
    expect(within(block).getByText("Couldn't plan").closest('.chip')).toHaveAttribute('data-status', 'danger')
    expect(screen.getByText("Couldn't plan Thursday dinner: every option was excluded or in Cool-down.")).toBeInTheDocument()
    const choose = screen.getByRole('button', { name: 'Choose a Recipe' })
    expect(choose).toHaveAttribute('data-variant', 'tertiary')
    await userEvent.click(choose)
    expect(h.onChoose).toHaveBeenCalledWith({ date: '2026-11-12', mealSlotId: 2 })
  })

  it('a slot with nothing planned and no reason just says so', () => {
    setup(slot({ meal: null }))
    expect(screen.getByText('Nothing planned')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose a Recipe' })).toBeInTheDocument()
  })
})
