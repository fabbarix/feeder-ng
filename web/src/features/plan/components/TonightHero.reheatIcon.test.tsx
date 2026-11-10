import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { isIcon } from '../../../test/iconPaths'
import { meal, slot } from '../test-utils'
import { TonightHero } from './TonightHero'

// R12 (user decision R4): the Reheat button uses the dedicated `reheat` icon, not the stand-in `timer` icon.
const served = slot({
  at: '2026-11-10T19:30:00Z',
  time: '19:30',
  meal: meal({ servedFromLeftover: { leftoverId: 4, date: '2026-11-09', mealSlotId: 2, recipeName: 'Chicken curry' }, cookMinutes: 45 }),
})

function reheatButton(now: Date) {
  render(<TonightHero slot={served} now={now} action="reheat" onCook={vi.fn()} onYesCooked={vi.fn()} onAdjust={vi.fn()} onReheat={vi.fn()} />)
  return screen.getByRole('button', { name: 'Reheat' })
}

describe('TonightHero: the Reheat icon (R12)', () => {
  it('the primary Reheat button (before the slot time) shows the reheat icon', () => {
    const svg = reheatButton(new Date('2026-11-10T17:00:00Z')).querySelector('svg')
    expect(isIcon(svg, 'reheat')).toBe(true)
    expect(isIcon(svg, 'timer')).toBe(false)
  })

  it('the secondary Reheat button (after the slot time) shows the reheat icon too', () => {
    const svg = reheatButton(new Date('2026-11-10T20:00:00Z')).querySelector('svg')
    expect(isIcon(svg, 'reheat')).toBe(true)
  })
})
