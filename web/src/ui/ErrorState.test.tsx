import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ErrorState } from './ErrorState'

describe('ErrorState', () => {
  it('is an alert showing the message with a warning icon', () => {
    render(<ErrorState message="The plan could not be loaded." />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('The plan could not be loaded.')
    expect(alert.querySelector('svg')).not.toBeNull()
  })

  it('offers Try again only when onRetry is given, and calls it', async () => {
    const { rerender } = render(<ErrorState message="Boom" />)
    expect(screen.queryByRole('button')).toBeNull()
    const onRetry = vi.fn()
    rerender(<ErrorState message="Boom" onRetry={onRetry} />)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('has a customisable retry label', () => {
    render(<ErrorState message="Boom" onRetry={() => {}} retryLabel="Reload" />)
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })
})
