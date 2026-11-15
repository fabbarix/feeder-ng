// B9-37 (RX-10): a Checkbox may carry an accessible name that says more than its visible label ("Optional" on an Ingredient line is
// named "Optional: garlic", so every line's box is told apart). Without it the name is the label, as before.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Checkbox } from './Checkbox'

describe('Checkbox ariaLabel', () => {
  it('names the box by ariaLabel and still shows the label', async () => {
    const onChange = vi.fn()
    render(<Checkbox label="Optional" ariaLabel="Optional: garlic" checked={false} onChange={onChange} />)
    const box = screen.getByRole('checkbox', { name: 'Optional: garlic' })
    expect(screen.getByText('Optional')).toBeInTheDocument()
    await userEvent.click(box)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('without it the label is the name', () => {
    render(<Checkbox label="Optional" checked onChange={() => {}} />)
    expect(screen.getByRole('checkbox', { name: 'Optional' })).toBeChecked()
  })
})
