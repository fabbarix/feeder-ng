// Runs against the real OfflineBanner. B9-49 (RES-07): the banner is fed the newest server contact, the Household zone remembered from
// /api/me (meCache) and the queue (Scans and Ticks).
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { writeCachedMe } from './meCache'
import { ShellStatus } from './ShellStatus'
import { useBackOnlineNotice } from './useBackOnlineNotice'
import type { Connectivity } from './useConnectivity'

let connectivity: Connectivity
vi.mock('./useConnectivity', () => ({ useConnectivity: () => connectivity }))
// The back-online toast is the hook's own test (useBackOnlineNotice.test.tsx); here only that ShellStatus feeds it.
vi.mock('./useBackOnlineNotice', () => ({ useBackOnlineNotice: vi.fn() }))

beforeEach(() => {
  localStorage.clear()
  connectivity = { offline: false, lastContact: null }
})

describe('ShellStatus', () => {
  it('renders nothing while online', () => {
    render(<ShellStatus pendingScans={4} pendingTicks={2} />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('offline: shows the last contact (24 h) and the Scans waiting to sync', () => {
    connectivity = { offline: true, lastContact: new Date(2026, 10, 10, 14, 2) }
    render(<ShellStatus pendingScans={3} />)
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent('Offline')
    expect(banner).toHaveTextContent('14:02')
    expect(banner).toHaveTextContent('3 Scans waiting to sync')
  })

  it('offline with nothing queued: no waiting line', () => {
    connectivity = { offline: true, lastContact: new Date(2026, 10, 10, 14, 2) }
    render(<ShellStatus />)
    expect(screen.getByRole('status')).not.toHaveTextContent(/waiting to sync/)
  })

  it('offline: Scans and Ticks are one line, "2 Scans and 1 Tick waiting to sync"', () => {
    connectivity = { offline: true, lastContact: new Date(2026, 10, 10, 14, 2) }
    render(<ShellStatus pendingScans={2} pendingTicks={1} />)
    expect(screen.getByRole('status')).toHaveTextContent('2 Scans and 1 Tick waiting to sync')
  })

  it('names the time in the Household zone remembered from /api/me, not the device\'s', () => {
    writeCachedMe({ id: 1, email: 'a@example.test', displayName: 'A', isAdmin: false, householdTimeZone: 'Pacific/Kiritimati' })
    // 04:30 on the 11th at UTC+14, whatever the device zone is; the banner's "today" is the Household's too
    vi.useFakeTimers({ now: new Date(Date.UTC(2026, 10, 10, 15, 0)) })
    try {
      connectivity = { offline: true, lastContact: new Date(Date.UTC(2026, 10, 10, 14, 30)) }
      render(<ShellStatus />)
      expect(screen.getByRole('status')).toHaveTextContent('Offline · showing what was saved at 04:30')
    } finally {
      vi.useRealTimers()
    }
  })

  it('offline with no contact ever recorded: "showing what was saved" with no time', () => {
    connectivity = { offline: true, lastContact: null }
    render(<ShellStatus />)
    expect(screen.getByRole('status')).toHaveTextContent('Offline · showing what was saved')
    expect(screen.getByRole('status')).not.toHaveTextContent(/\d\d:\d\d/)
  })

  it('feeds the back-online notice with the connection and the queue, so the toast can say what synced', () => {
    connectivity = { offline: true, lastContact: null }
    render(<ShellStatus pendingScans={2} pendingTicks={1} />)
    expect(vi.mocked(useBackOnlineNotice)).toHaveBeenLastCalledWith({ offline: true, pendingScans: 2, pendingTicks: 1 })
  })

  it('also while online (the notice is the one that speaks when the queue drains)', () => {
    render(<ShellStatus />)
    expect(vi.mocked(useBackOnlineNotice)).toHaveBeenLastCalledWith({ offline: false, pendingScans: 0, pendingTicks: 0 })
  })
})
