// F-02 (A1): a list of Switches repeats a short visible label ("Admin") but must announce which row it belongs to.
// `aria-label` overrides the accessible name only; the visible text stays `label`.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Switch } from './Switch'

describe('Switch: aria-label', () => {
  it('shows the label and is named by aria-label when one is given', () => {
    render(<Switch label="Admin" aria-label="Admin: cook@example.test" checked={false} onChange={() => {}} />)
    const sw = screen.getByRole('switch', { name: 'Admin: cook@example.test' })
    expect(sw).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeVisible()
    expect(screen.queryByRole('switch', { name: 'Admin' })).toBeNull()
  })

  it('is named by the label without it (unchanged)', () => {
    render(<Switch label="Timer finished" checked onChange={() => {}} />)
    expect(screen.getByRole('switch', { name: 'Timer finished' })).toBeChecked()
  })

  it('still toggles', async () => {
    const onChange = vi.fn()
    render(<Switch label="Admin" aria-label="Admin: a@x.test" checked={false} onChange={onChange} />)
    await userEvent.click(screen.getByRole('switch', { name: 'Admin: a@x.test' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })
})
