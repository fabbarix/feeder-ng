// B5-F1 (ADR 0014): the compact row of a Not served slot.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { slot } from '../test-utils'
import { NotServedRow } from './NotServedRow'

const thu = slot({ date: '2026-11-12', mealSlotId: 4, notServed: true })

describe('NotServedRow', () => {
  it('says "Dinner · Not served" and offers Plan Dinner again', async () => {
    const onPlanAgain = vi.fn()
    render(<NotServedRow slot={thu} onPlanAgain={onPlanAgain} />)
    expect(screen.getByText('Dinner · Not served')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Plan Dinner again' }))
    expect(onPlanAgain).toHaveBeenCalledWith({ date: '2026-11-12', mealSlotId: 4 })
  })

  it('shows no Course rows, no why chips and no Couldn\'t plan chip', () => {
    render(<NotServedRow slot={thu} onPlanAgain={() => {}} />)
    expect(screen.queryByText("Couldn't plan")).not.toBeInTheDocument()
    expect(screen.queryByText('Not planned')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Choose a Recipe' })).not.toBeInTheDocument()
  })

  it('offline the button is disabled and says Needs a connection', () => {
    render(<NotServedRow slot={thu} offline onPlanAgain={() => {}} />)
    expect(screen.getByRole('button', { name: /Plan Dinner again/ })).toBeDisabled()
    expect(screen.getByText('Needs a connection')).toBeInTheDocument()
  })
})
