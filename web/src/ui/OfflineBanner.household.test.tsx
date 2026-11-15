// B9-49 (RES-07): the offline banner's copy. "Offline · showing what was saved at 04:30": the time is the newest successful server
// answer, formatted in the Household zone; an earlier day gets a weekday ("saved Sat 18:05"). The queue line names what waits to sync:
// "1 Tick waiting to sync", "2 Scans and 1 Tick waiting to sync". `savedAt` stays the prop that carries the moment; `timeZone` and `now` are new.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OfflineBanner } from './OfflineBanner'
import { overlayStrings } from './overlayStrings'

const status = () => screen.getByRole('status')
// 2026-11-10 14:30 UTC: 04:30 on the 11th at UTC+14, 08:30 on the 10th at UTC-6.
const at = new Date(Date.UTC(2026, 10, 10, 14, 30))
const soon = new Date(Date.UTC(2026, 10, 10, 15, 0))

describe('OfflineBanner time', () => {
  it('names the moment in the Household zone: "saved at 04:30" at UTC+14, never the device\'s 08:30', () => {
    render(<OfflineBanner offline savedAt={at} timeZone="Pacific/Kiritimati" now={soon} />)
    expect(status()).toHaveTextContent('Offline · showing what was saved at 04:30')
    expect(status()).not.toHaveTextContent('08:30')
  })

  it('a moment that is not today in the Household zone has a day prefix and no "at": "saved Sat 18:05"', () => {
    const saturday = new Date(Date.UTC(2026, 10, 14, 18, 5))
    render(<OfflineBanner offline savedAt={saturday} timeZone="UTC" now={new Date(Date.UTC(2026, 10, 16, 9, 0))} />)
    expect(status()).toHaveTextContent('Offline · showing what was saved Sat 18:05')
    expect(status()).not.toHaveTextContent(/saved at/)
  })

  it('stays a polite status; the text changes are announced once (no aria-atomic churn, no second live region)', () => {
    render(<OfflineBanner offline savedAt={at} timeZone="UTC" now={soon} />)
    expect(status()).toHaveAttribute('aria-live', 'polite')
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('the pill is click-through in its slot: only the pill is a target (class offline-banner on the status element)', () => {
    render(<OfflineBanner offline savedAt={at} timeZone="UTC" now={soon} />)
    expect(status()).toHaveClass('offline-banner')
  })
})

describe('OfflineBanner queue line', () => {
  it.each([
    [0, 1, '1 Tick waiting to sync'],
    [0, 3, '3 Ticks waiting to sync'],
    [1, 0, '1 Scan waiting to sync'],
    [2, 0, '2 Scans waiting to sync'],
    [2, 1, '2 Scans and 1 Tick waiting to sync'],
    [1, 2, '1 Scan and 2 Ticks waiting to sync'],
  ])('%i Scans and %i Ticks read "%s"', (scans, ticks, text) => {
    render(<OfflineBanner offline pendingScans={scans} pendingTicks={ticks} />)
    expect(status().querySelector('.offline-banner__queue')).toHaveTextContent(text)
  })

  it('there is one queue line, and none at 0 and 0', () => {
    const { rerender } = render(<OfflineBanner offline pendingScans={2} pendingTicks={1} />)
    expect(status().querySelectorAll('.offline-banner__queue')).toHaveLength(1)
    rerender(<OfflineBanner offline pendingScans={0} pendingTicks={0} />)
    expect(status().querySelector('.offline-banner__queue')).toBeNull()
  })

  it('renders nothing while online, whatever waits', () => {
    const { container } = render(<OfflineBanner offline={false} pendingScans={2} pendingTicks={1} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('the copy lives in overlayStrings.queueWaiting (and the old scansWaiting still reads the same for Scans alone)', () => {
    expect(overlayStrings.queueWaiting(2, 1)).toBe('2 Scans and 1 Tick waiting to sync')
    expect(overlayStrings.queueWaiting(0, 0)).toBe('')
    expect(overlayStrings.scansWaiting(1)).toBe('1 Scan waiting to sync')
  })
})
