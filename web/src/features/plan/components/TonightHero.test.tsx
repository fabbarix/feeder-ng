import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { favourite, meal, slot } from '../test-utils'
import type { PlanSlot } from '../types'
import { TonightHero } from './TonightHero'

const key = { date: '2026-11-10', mealSlotId: 2, courseId: 1 }
const before = new Date('2026-11-10T17:00:00Z')
const after = new Date('2026-11-10T20:00:00Z')

function setup(s: PlanSlot, now = before, busy = false) {
  const h = { onCook: vi.fn(), onYesCooked: vi.fn(), onAdjust: vi.fn() }
  const view = render(<TonightHero slot={s} now={now} busy={busy} {...h} />)
  return { ...h, container: view.container }
}

const dinner = (over = {}) => slot({ at: '2026-11-10T19:30:00Z', time: '19:30', meal: meal({ cookMinutes: 45, startBy: '18:45', why: [favourite('Anna'), { code: 'stock_coverage', ingredient: 'rice' }, { code: 'slot_rule', tag: 'x' }], ...over }) })

describe('TonightHero before the slot time', () => {
  it('is the large accent hero tile with the overline, start-by time and Recipe name', () => {
    const { container } = setup(dinner())
    expect(container.querySelector('[data-variant="hero"]')).not.toBeNull()
    expect(container.querySelector('[data-span="full"]')).not.toBeNull()
    expect(screen.getByText('DINNER · 19:30')).toBeInTheDocument()
    expect(screen.getByText('start 18:45')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Chicken curry' })).toBeInTheDocument()
  })

  it('shows two why chips at most', () => {
    const { container } = setup(dinner())
    expect(container.querySelectorAll('.chip')).toHaveLength(2)
    expect(screen.getByText("Anna's favourite")).toBeInTheDocument()
    expect(screen.getByText('uses Stock: rice')).toBeInTheDocument()
  })

  it('B2: the primary button is Cook with the duration and opens Cook Mode for the slot', async () => {
    const h = setup(dinner())
    const cook = screen.getByRole('button', { name: 'Cook · 45 min' })
    expect(cook).toHaveAttribute('data-variant', 'primary')
    await userEvent.click(cook)
    expect(h.onCook).toHaveBeenCalledWith(key)
    expect(screen.queryByRole('button', { name: 'Yes, Cooked' })).not.toBeInTheDocument()
  })

  it('without a known duration or start time it is plain Cook', () => {
    setup(dinner({ cookMinutes: undefined, startBy: undefined }))
    expect(screen.getByRole('button', { name: 'Cook' })).toBeInTheDocument()
    expect(screen.queryByText(/^start /)).not.toBeInTheDocument()
  })

  it('shows the photo as a thumb when there is one', () => {
    setup(dinner({ photoUrl: '/img/curry.jpg' }))
    expect(screen.getByRole('img', { name: 'Chicken curry' })).toHaveAttribute('src', '/img/curry.jpg')
  })
})

describe('TonightHero after the slot time', () => {
  it('asks "<Recipe> cooked?" with Yes, Cooked (primary) and Adjust (secondary)', async () => {
    const h = setup(dinner(), after)
    expect(screen.getByRole('heading', { name: 'Chicken curry cooked?' })).toBeInTheDocument()
    const yes = screen.getByRole('button', { name: 'Yes, Cooked' })
    expect(yes).toHaveAttribute('data-variant', 'primary')
    await userEvent.click(yes)
    expect(h.onYesCooked).toHaveBeenCalledWith(key)
    await userEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    expect(h.onAdjust).toHaveBeenCalledWith(key)
    expect(screen.queryByRole('button', { name: /^Cook/ })).not.toBeInTheDocument()
  })

  it('disables the buttons while a Yes, Cooked is being saved', () => {
    setup(dinner(), after, true)
    expect(screen.getByRole('button', { name: 'Yes, Cooked' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Adjust' })).toBeDisabled()
  })
})

// N3
describe('TonightHero day and action (N3)', () => {
  const lunch = (over = {}) =>
    slot({ date: '2026-11-11', mealSlotId: 1, name: 'Lunch', time: '13:00', at: '2026-11-11T13:00:00Z', meal: meal({ date: '2026-11-11', mealSlotId: 1, ...over }) })
  const leftoverMeal = { servedFromLeftover: { date: '2026-11-10', mealSlotId: 2, recipeName: 'Chicken curry', leftoverId: 5 } }

  function render2(s: PlanSlot, props: { day: 'today' | 'tomorrow' | 'later'; action: 'cook' | 'leftover' | 'none' }) {
    const h = { onCook: vi.fn(), onYesCooked: vi.fn(), onAdjust: vi.fn() }
    render(<TonightHero slot={s} now={before} {...props} {...h} />)
    return h
  }

  it('tomorrow: a day label overline "TOMORROW · LUNCH" instead of the slot time', () => {
    render2(lunch(), { day: 'tomorrow', action: 'none' })
    expect(screen.getByText('TOMORROW · LUNCH')).toBeInTheDocument()
    expect(screen.queryByText(/13:00/)).not.toBeInTheDocument()
  })

  it('a Leftover-served meal shows "Leftover from Tue" and no Cook button', () => {
    render2(lunch(leftoverMeal), { day: 'tomorrow', action: 'leftover' })
    expect(screen.getByText('Leftover from Tue')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Cook/ })).not.toBeInTheDocument()
  })

  it('action none (a fresh meal not due today) has no Cook button either', () => {
    render2(lunch(), { day: 'tomorrow', action: 'none' })
    expect(screen.queryByRole('button', { name: /^Cook/ })).not.toBeInTheDocument()
  })

  it('action cook keeps the Cook button', () => {
    render2(dinner(), { day: 'today', action: 'cook' })
    expect(screen.getByRole('button', { name: 'Cook · 45 min' })).toBeInTheDocument()
  })
})
