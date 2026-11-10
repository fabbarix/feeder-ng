import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MAX_BATCHES } from '../lib/cookEntry'
import { CookEntry } from './CookEntry'

const props = () => ({ batches: 2, onBatchesChange: vi.fn(), yieldValue: 4, onStart: vi.fn() })

describe('CookEntry', () => {
  it('chooses the Batch count with a Stepper', async () => {
    const p = props()
    render(<CookEntry {...p} />)
    expect(screen.getByRole('spinbutton', { name: 'Batches' })).toHaveAttribute('aria-valuenow', '2')
    await userEvent.click(screen.getByRole('button', { name: 'Increase Batches' }))
    expect(p.onBatchesChange).toHaveBeenCalledWith(3)
    await userEvent.click(screen.getByRole('button', { name: 'Decrease Batches' }))
    expect(p.onBatchesChange).toHaveBeenCalledWith(1)
  })
  it('cannot go below one Batch or above the maximum', () => {
    const { rerender } = render(<CookEntry {...props()} batches={1} />)
    expect(screen.getByRole('button', { name: 'Decrease Batches' })).toBeDisabled()
    rerender(<CookEntry {...props()} batches={MAX_BATCHES} />)
    expect(screen.getByRole('button', { name: 'Increase Batches' })).toBeDisabled()
  })
  it('says what the Batches make', () => {
    render(<CookEntry {...props()} batches={2} yieldValue={4} />)
    expect(screen.getByText('2 Batches · 8 portions')).toBeInTheDocument()
  })
  it('starts Cook Mode', async () => {
    const p = props()
    render(<CookEntry {...p} />)
    await userEvent.click(screen.getByRole('button', { name: 'Start Cook Mode' }))
    expect(p.onStart).toHaveBeenCalledOnce()
  })
})
