import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AccessBadge } from './AccessBadge'

describe('AccessBadge', () => {
  it('shows nothing at zero', () => {
    const { container } = render(<AccessBadge count={0} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('shows the count with a screen-reader label', () => {
    render(<AccessBadge count={3} />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByLabelText('3 sign-in requests waiting')).toBeInTheDocument()
  })
  it('says 9+ for many, and 1 request in the singular', () => {
    const { rerender } = render(<AccessBadge count={12} />)
    expect(screen.getByText('9+')).toBeInTheDocument()
    rerender(<AccessBadge count={1} />)
    expect(screen.getByLabelText('1 sign-in request waiting')).toBeInTheDocument()
  })
})
