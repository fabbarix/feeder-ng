// B5-F1 (ADR 0014, beta5-plan 2.2): the Planned Meal sheet's attendance ends with the Guests.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { slot } from '../test-utils'
import type { PlanSlot } from '../types'
import { PlannedMealSheet } from './PlannedMealSheet'

const attendance = [
  { id: 1, name: 'Anna', colour: '#3366cc' },
  { id: 2, name: 'Sam', colour: '#81b29a' },
]
const open = (over: Partial<PlanSlot>) => {
  render(
    <PlannedMealSheet open slot={slot({ attendance, ...over })} courseId={1} today="2026-11-10" onClose={vi.fn()} onCook={vi.fn()} onMarkCooked={vi.fn()} onSwap={vi.fn()} onPin={vi.fn()} onUnpin={vi.fn()} onChoose={vi.fn()} />,
  )
  return within(screen.getByRole('dialog'))
}

describe('PlannedMealSheet: Guests', () => {
  it('ends the attendees with "+2 Guests"', () => {
    const d = open({ guests: 2, portions: 6 })
    expect(d.getByText('+2 Guests')).toBeInTheDocument()
    expect(d.getByRole('img', { name: 'Anna' })).toBeInTheDocument()
  })

  it('one Guest is singular', () => {
    expect(open({ guests: 1 }).getByText('+1 Guest')).toBeInTheDocument()
  })

  it('a date with Guests and no Member says "2 Guests"', () => {
    const d = open({ attendance: [], guests: 2 })
    expect(d.getByText('2 Guests')).toBeInTheDocument()
  })

  it('no Guests, no text', () => {
    const d = open({ guests: 0 })
    expect(d.queryByText(/Guest/)).not.toBeInTheDocument()
  })
})
