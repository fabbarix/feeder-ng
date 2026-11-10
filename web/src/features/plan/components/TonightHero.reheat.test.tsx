import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { meal, slot } from '../test-utils'
import { TonightHero } from './TonightHero'

const key = { date: '2026-11-10', mealSlotId: 2 }
const before = new Date('2026-11-10T17:00:00Z')
const after = new Date('2026-11-10T20:00:00Z')
const served = slot({
  at: '2026-11-10T19:30:00Z',
  time: '19:30',
  meal: meal({ servedFromLeftover: { leftoverId: 4, date: '2026-11-09', mealSlotId: 2, recipeName: 'Chicken curry' }, cookMinutes: 45 }),
})

function setup(now: Date, action: 'reheat' | 'leftover' | 'cook' = 'reheat') {
  const h = { onCook: vi.fn(), onYesCooked: vi.fn(), onAdjust: vi.fn(), onReheat: vi.fn() }
  const view = render(<TonightHero slot={served} now={now} action={action} {...h} />)
  return { ...h, container: view.container }
}

describe('TonightHero: Reheat (R12)', () => {
  it('before the slot time the one primary button is Reheat, with a timer icon, and no Cook', async () => {
    const h = setup(before)
    const reheat = screen.getByRole('button', { name: 'Reheat' })
    expect(reheat).toHaveAttribute('data-variant', 'primary')
    expect(reheat.querySelector('svg')).not.toBeNull()
    expect(screen.queryByRole('button', { name: /^Cook/ })).not.toBeInTheDocument()
    await userEvent.click(reheat)
    expect(h.onReheat).toHaveBeenCalledWith(key)
  })

  it('keeps the Leftover chip next to it', () => {
    setup(before)
    expect(screen.getByText(/Leftover from/)).toBeInTheDocument()
  })

  it('after the slot time it asks Yes, Cooked (primary) with Reheat (secondary) instead of Adjust', async () => {
    const h = setup(after)
    expect(screen.getByRole('button', { name: 'Yes, Cooked' })).toHaveAttribute('data-variant', 'primary')
    const reheat = screen.getByRole('button', { name: 'Reheat' })
    expect(reheat).toHaveAttribute('data-variant', 'secondary')
    expect(screen.queryByRole('button', { name: 'Adjust' })).not.toBeInTheDocument()
    await userEvent.click(reheat)
    expect(h.onReheat).toHaveBeenCalledWith(key)
  })

  it('a Leftover meal on a later day (action leftover) offers no Reheat', () => {
    setup(before, 'leftover')
    expect(screen.queryByRole('button', { name: 'Reheat' })).not.toBeInTheDocument()
  })

  it('without an onReheat handler the Reheat button is not shown, before or after the slot time', () => {
    for (const now of [before, after]) {
      const { unmount } = render(<TonightHero slot={served} now={now} action="reheat" onCook={vi.fn()} onYesCooked={vi.fn()} onAdjust={vi.fn()} />)
      expect(screen.queryByRole('button', { name: 'Reheat' })).not.toBeInTheDocument()
      unmount()
    }
  })
})
