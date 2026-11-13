import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { favourite, meal, slot } from '../test-utils'
import { MealTile } from './MealTile'

function setup(s = slot(), today = '2026-11-10') {
  const handlers = { onOpen: vi.fn(), onSwap: vi.fn(), onChoose: vi.fn(), onCook: vi.fn(), onPin: vi.fn(), onUnpin: vi.fn() }
  const view = render(<MealTile slot={s} today={today} {...handlers} />)
  return { ...handlers, container: view.container }
}

const key = { date: '2026-11-10', mealSlotId: 2, courseId: 1 }
const chipsOf = (container: HTMLElement) => container.querySelectorAll('.chip')

describe('MealTile (on a day tile)', () => {
  // ds-plan: the slot header shows the time (the 7-column week that hid it is gone).
  it('shows the Meal Slot with its time and the Recipe name, no Batches or portions', () => {
    setup(slot({ meal: meal({ batches: 2, portions: 3.5 }) }))
    expect(screen.getByText('Dinner')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Chicken curry/ })).toBeInTheDocument()
    expect(screen.getByText(/19:00/)).toBeInTheDocument()
    expect(screen.queryByText(/Batch/)).not.toBeInTheDocument()
    expect(screen.queryByText(/portions/)).not.toBeInTheDocument()
  })

  // ds-plan: the row has one line of chips and clips what does not fit, so it carries all of them (was: at most ONE chip).
  it('carries every chip the meal has, in priority order; the row clips them to one line', () => {
    const { container } = setup(slot({
      meal: meal({
        pinned: true,
        why: [favourite('Anna'), { code: 'perishable_use', ingredient: 'spinach', date: '2026-11-12' }, { code: 'ingredient_overlap', ingredient: 'chicken', date: '2026-11-09' }],
      }),
    }))
    expect(chipsOf(container).length).toBeGreaterThan(1)
    expect(chipsOf(container)[0]).toHaveTextContent('Pinned')
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

  // ds-plan: Pin is an icon action of the row now (was: only in the sheet).
  it('has Swap and Pin on the row, and no Confirm, Unpin or Mark as Cooked buttons: those live in the sheet', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Pin' })).toBeInTheDocument()
    for (const name of ['Confirm', 'Unpin', 'Mark as Cooked']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  describe('B2: Cook Mode from the tile', () => {
    it("today's planned meal has a Cook icon button", async () => {
      const h = setup()
      await userEvent.click(screen.getByRole('button', { name: 'Cook' }))
      expect(h.onCook).toHaveBeenCalledWith({ date: '2026-11-10', mealSlotId: 2 }) // ds-plan: the header Cook is the slot's
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

  // R11b N6: the Cooked state is marked by the chip (success colours + check icon), not by dimming the tile.
  it('the Cooked chip is a success state chip with an icon', () => {
    setup(slot({ meal: meal({ state: 'cooked' }) }))
    const chip = screen.getByText('Cooked').closest('.chip')!
    expect(chip).toHaveAttribute('data-status', 'success')
    expect(chip.querySelector('svg')).not.toBeNull()
  })

  it('a Not cooked meal says so and has no icon buttons', () => {
    setup(slot({ meal: meal({ state: 'skipped' }) }))
    expect(screen.getByText('Not cooked')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Swap' })).not.toBeInTheDocument()
  })

  // ds-plan: the empty Course is a dashed ListRow: the short reason is its title, the "Not planned" chip its chip line, and the
  // whole row is "Choose a Recipe" (was: a tertiary button under a reason sentence).
  it('R13: an empty slot is a dashed row with a "Not planned" chip (never danger), the short reason and Choose a Recipe as its target', async () => {
    const h = setup(slot({
      date: '2026-11-12', meal: null,
      unfilled: { reason: 'no_candidates', slotRuleClaimed: false, eliminated: { considered: 3, exclusion: 3, coolDown: 0, varietyRule: 0, advanceStep: 0 } },
    }))
    const block = screen.getByText('Not planned').closest('[data-unfilled]') as HTMLElement
    expect(block).not.toBeNull()
    const chip = within(block).getByText('Not planned').closest('.chip')!
    expect(chip).toHaveAttribute('data-kind', 'status')
    expect(chip).toHaveAttribute('data-status', 'spoil') // warn: a rule conflict
    expect(block.querySelector('[data-status="danger"]')).toBeNull()
    expect(screen.getByText('Every Recipe is excluded.')).toBeInTheDocument()
    expect(screen.queryByText(/Couldn't plan Thursday dinner/)).not.toBeInTheDocument()
    const choose = screen.getByRole('button', { name: 'Choose a Recipe' })
    expect(choose.closest('li')).toBe(block)
    await userEvent.click(choose)
    expect(h.onChoose).toHaveBeenCalledWith({ date: '2026-11-12', mealSlotId: 2, courseId: 1 })
  })

  it('R13: a setup gap (nobody attends) is the blue info chip with its reason', () => {
    setup(slot({ meal: null, unfilled: { reason: 'no_attendance', slotRuleClaimed: false, eliminated: { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 } } }))
    const chip = screen.getByText('Not planned').closest('.chip')!
    expect(chip).toHaveAttribute('data-kind', 'status')
    expect(chip).toHaveAttribute('data-status', 'info')
    expect(screen.getByText('Nobody is set to attend.')).toBeInTheDocument()
  })

  it('R13: choosing a Recipe is no fix for a slot nobody attends, so the day tile offers none', () => {
    setup(slot({ meal: null, unfilled: { reason: 'no_attendance', slotRuleClaimed: false, eliminated: { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 } } }))
    expect(screen.queryByRole('button', { name: 'Choose a Recipe' })).not.toBeInTheDocument()
  })

  it('a slot with nothing planned and no reason just says so', () => {
    setup(slot({ meal: null }))
    expect(screen.getByText('Nothing planned')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose a Recipe' })).toBeInTheDocument()
  })

  // ds-plan: the 2-line clamp is ListRow's; the full name stays the row's accessible name.
  it('R2-2: the row is named by the full Recipe name (the 2-line clamp never hides it)', () => {
    setup(slot({ meal: meal({ recipeName: 'Slow-roasted chicken thighs with lemon and thyme' }) }))
    expect(screen.getByRole('button', { name: 'Slow-roasted chicken thighs with lemon and thyme' })).toBeInTheDocument()
  })
})
