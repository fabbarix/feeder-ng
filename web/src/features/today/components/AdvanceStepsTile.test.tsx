import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AdvanceStepDue } from '../types'
import { AdvanceStepsTile } from './AdvanceStepsTile'

const due: AdvanceStepDue = {
  mealDate: '2026-11-09',
  mealSlotId: 3,
  recipeName: 'Chicken curry',
  description: 'Marinate the chicken',
  dueAt: '2026-11-09T14:30:00Z',
  dueTime: '15:30',
  slotTime: '19:30',
  state: 'due',
}

describe('AdvanceStepsTile', () => {
  it('shows a due step as "Now, for 19:30" under the Advance Steps heading', () => {
    render(<AdvanceStepsTile steps={[due]} />)
    expect(screen.getByRole('heading', { name: 'Advance Steps' })).toBeInTheDocument()
    expect(screen.getByText('Marinate the chicken')).toBeInTheDocument()
    expect(screen.getByText('Chicken curry')).toBeInTheDocument()
    expect(screen.getByText('Now, for 19:30')).toBeInTheDocument()
  })

  it('shows an upcoming step with its due time', () => {
    render(<AdvanceStepsTile steps={[{ ...due, state: 'upcoming', description: 'Prove the dough', dueTime: '14:00', slotTime: '20:00' }]} />)
    expect(screen.getByText('At 14:00, for 20:00')).toBeInTheDocument()
  })

  it('lists steps in the order given', () => {
    render(<AdvanceStepsTile steps={[{ ...due, description: 'Prove the dough' }, due]} />)
    const items = screen.getAllByRole('listitem').map((li) => li.textContent ?? '')
    expect(items[0]).toContain('Prove the dough')
    expect(items[1]).toContain('Marinate the chicken')
  })

  it('renders nothing when there are no steps', () => {
    const { container } = render(<AdvanceStepsTile steps={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
