// B9-44 (TB-03): the hero's Cook button follows the hero's own width, not the viewport: one container rule in CSS (todayGrid.css.test.ts) replaces
// the viewport rule, so the button no longer asks to be full width "below 600 px of viewport" (block="phone"). Cook keeps its place at the end from
// 35 rem of hero and is full width below it, whatever the page around it does.
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { meal, slot } from '../test-utils'
import type { SlotDateActions } from '../types'
import { TonightHero } from './TonightHero'

const dateActions: SlotDateActions = { offline: false, onWhosEating: vi.fn(), onNotServed: vi.fn(), onTime: vi.fn(), onPlanAgain: vi.fn() }

describe('TonightHero: Cook', () => {
  it('is not sized by the viewport (no data-block="phone")', () => {
    render(
      <MemoryRouter>
        <TonightHero
          slot={slot({ at: '2026-11-10T19:30:00Z', time: '19:30', meal: meal({ recipeName: 'Chicken curry', cookMinutes: 45, startBy: '18:45' }) })}
          now={new Date('2026-11-10T17:00:00Z')}
          today="2026-11-10"
          dateActions={dateActions}
          onCook={vi.fn()}
          onYesCooked={vi.fn()}
          onAdjust={vi.fn()}
        />
      </MemoryRouter>,
    )
    const cook = screen.getByRole('button', { name: /^Cook/ })
    expect(cook.getAttribute('data-block')).not.toBe('phone')
    expect(cook.closest('.plan-hero__actions')).not.toBeNull()
  })
})
