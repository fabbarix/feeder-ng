import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AccessBadge } from './AccessBadge'

describe('AccessBadge', () => {
  it('shows nothing at zero', () => {
    const { container } = render(<AccessBadge count={0} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('shows the count', () => {
    render(<AccessBadge count={3} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })
  it('says 9+ for many', () => {
    const { rerender } = render(<AccessBadge count={12} />)
    expect(screen.getByText('9+')).toBeInTheDocument()
    rerender(<AccessBadge count={1} />)
    expect(screen.getByText('1')).toBeInTheDocument()
  })
  // TB-15e: the avatar button's own name already counts the requests ("Your menu, 3 sign-in requests waiting"), so the badge is
  // decoration: hidden from assistive technology, no img role, no label of its own.
  it('is aria-hidden, with no role and no label, so the count is not announced twice (TB-15e)', () => {
    render(<AccessBadge count={3} />)
    const badge = screen.getByText('3')
    expect(badge).toHaveAttribute('aria-hidden', 'true')
    expect(badge).not.toHaveAttribute('role')
    expect(badge).not.toHaveAttribute('aria-label')
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByLabelText(/sign-in request/i)).toBeNull()
  })
})
