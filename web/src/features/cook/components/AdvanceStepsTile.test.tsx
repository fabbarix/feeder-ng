import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AdvanceItem } from '../types'
import { AdvanceStepsTile } from './AdvanceStepsTile'

const done: AdvanceItem = { step: 0, text: 'Marinate the chicken', leadTimeMinutes: 240, done: true, doneAt: '2026-11-09T08:00:00Z', warning: false }
const pending: AdvanceItem = { step: 3, text: 'Soak the beans', leadTimeMinutes: 480, done: false, doneAt: null, warning: true }

describe('AdvanceStepsTile', () => {
  it('lists done ones as done and pending ones with a warning', () => {
    render(<AdvanceStepsTile summary={{ done: [done], pending: [pending] }} onMarkDone={() => {}} />)
    expect(screen.getByText('Done: Marinate the chicken')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Not done yet: Soak the beans (start 8 h ahead)')
  })

  it('marks a pending Advance Step done by its Recipe Step index', async () => {
    const onMarkDone = vi.fn()
    render(<AdvanceStepsTile summary={{ done: [], pending: [pending] }} onMarkDone={onMarkDone} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mark "Soak the beans" as done' }))
    expect(onMarkDone).toHaveBeenCalledWith(3)
  })

  it('has no warning when everything is done', () => {
    render(<AdvanceStepsTile summary={{ done: [done], pending: [] }} onMarkDone={() => {}} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders nothing without Advance Steps', () => {
    const { container } = render(<AdvanceStepsTile summary={{ done: [], pending: [] }} onMarkDone={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
