import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OfflineBanner } from './OfflineBanner'

describe('OfflineBanner', () => {
  it('renders nothing while online', () => {
    const { container } = render(<OfflineBanner offline={false} savedAt={new Date()} pendingScans={3} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('is a polite status with the last-saved time in 24 h', () => {
    render(<OfflineBanner offline savedAt={new Date(2026, 10, 10, 14, 2)} />)
    const banner = screen.getByRole('status')
    expect(banner).toHaveAttribute('aria-live', 'polite')
    expect(banner).toHaveTextContent('Offline · showing what was saved at 14:02')
  })

  it('pads and never uses AM/PM (07:05, 23:59)', () => {
    const { rerender } = render(<OfflineBanner offline savedAt={new Date(2026, 10, 10, 7, 5)} />)
    expect(screen.getByRole('status')).toHaveTextContent('at 07:05')
    rerender(<OfflineBanner offline savedAt={new Date(2026, 10, 10, 23, 59)} />)
    expect(screen.getByRole('status')).toHaveTextContent('at 23:59')
    expect(screen.getByRole('status')).not.toHaveTextContent(/AM|PM/)
  })

  it('without a time says only that data was saved', () => {
    render(<OfflineBanner offline />)
    expect(screen.getByRole('status')).toHaveTextContent('Offline · showing what was saved')
    expect(screen.getByRole('status')).not.toHaveTextContent(/saved at/)
  })

  it('counts scans waiting to sync, singular and plural, hidden at 0', () => {
    const { rerender } = render(<OfflineBanner offline pendingScans={3} />)
    expect(screen.getByRole('status')).toHaveTextContent('3 scans waiting to sync')
    rerender(<OfflineBanner offline pendingScans={1} />)
    expect(screen.getByRole('status')).toHaveTextContent('1 scan waiting to sync')
    rerender(<OfflineBanner offline pendingScans={0} />)
    expect(screen.getByRole('status')).not.toHaveTextContent(/waiting to sync/)
  })
})
