// CRS E2: a Switch can carry a helper line that is read with it.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Switch } from './Switch'

describe('Switch description', () => {
  it('shows the helper and links it with aria-describedby', () => {
    render(<Switch label="Whole meal" description="Leaves the other Courses empty" checked={false} onChange={vi.fn()} />)
    expect(screen.getByText('Leaves the other Courses empty')).toBeVisible()
    expect(screen.getByRole('switch', { name: 'Whole meal' })).toHaveAccessibleDescription('Leaves the other Courses empty')
  })
  it('keeps the accessible name to the label alone', () => {
    render(<Switch label="Whole meal" description="Leaves the other Courses empty" checked onChange={vi.fn()} />)
    expect(screen.getByRole('switch')).toHaveAccessibleName('Whole meal')
  })
  it('has no description without the prop', () => {
    render(<Switch label="Admin" checked={false} onChange={vi.fn()} />)
    expect(screen.getByRole('switch', { name: 'Admin' })).not.toHaveAttribute('aria-describedby')
  })
})
