// R2-2 (L-07): the hero's primary is an `lg` button inside the actions row (full width on a phone only, auto width and
// at the tile's end from 820 px by CSS), never a bare grid child that stretches over 1000 px.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { meal, slot } from '../test-utils'
import { TonightHero } from './TonightHero'

const h = () => ({ onCook: vi.fn(), onYesCooked: vi.fn(), onAdjust: vi.fn() })
const dinner = () => slot({ at: '2026-11-10T19:30:00Z', time: '19:30', meal: meal({ cookMinutes: 45 }) })

describe('TonightHero primary action layout', () => {
  it('Cook is a large button in the hero actions row, full width on a phone only', () => {
    const { container } = render(<TonightHero slot={dinner()} now={new Date('2026-11-10T17:00:00Z')} {...h()} />)
    const cook = screen.getByRole('button', { name: 'Cook · 45 min' })
    expect(cook).toHaveAttribute('data-size', 'lg')
    expect(cook).toHaveAttribute('data-block', 'phone')
    expect(cook.closest('.plan-hero__actions')).not.toBeNull()
    expect(container.querySelector('.plan-hero > button')).toBeNull()
  })

  // DS-TODAY round 2 (changed on purpose): Cooked and Adjust are one ActionGroup (md buttons), not a large-button row.
  it('Cooked shares the hero\'s one ActionGroup with Adjust', () => {
    render(<TonightHero slot={dinner()} now={new Date('2026-11-10T20:00:00Z')} {...h()} />)
    const yes = screen.getByRole('button', { name: 'Cooked' })
    expect(yes.closest('[role="group"]')).toBe(screen.getByRole('button', { name: 'Adjust' }).closest('[role="group"]'))
    expect(yes.closest('[role="group"]')).toHaveClass('action-group')
  })

  it('Reheat keeps the same row', () => {
    render(<TonightHero slot={dinner()} now={new Date('2026-11-10T17:00:00Z')} action="reheat" onReheat={vi.fn()} {...h()} />)
    expect(screen.getByRole('button', { name: 'Reheat' }).closest('.plan-hero__actions')).not.toBeNull()
  })
})
