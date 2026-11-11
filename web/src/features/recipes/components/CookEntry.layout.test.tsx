// R2-1 (L-03, D-01): the Cook entry is plain content (the StickyActionBar or the left column carries it); its Batches Stepper is the compact one.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CookEntry } from './CookEntry'

describe('CookEntry layout', () => {
  it('uses the compact Stepper (size="sm", never stretched)', () => {
    render(<CookEntry batches={2} onBatchesChange={vi.fn()} yieldValue={4} onStart={vi.fn()} />)
    expect(screen.getByRole('group', { name: 'Batches' })).toHaveAttribute('data-size', 'sm')
  })
  it('keeps the hint under the stepper and the start button as the one primary action', () => {
    const { container } = render(<CookEntry batches={1} onBatchesChange={vi.fn()} yieldValue={4} onStart={vi.fn()} />)
    expect(container.querySelector('.cook-entry__batches')).toContainElement(screen.getByText('1 Batch · 4 portions'))
    expect(screen.getByRole('button', { name: 'Start Cook Mode' })).toBeInTheDocument()
  })
})
