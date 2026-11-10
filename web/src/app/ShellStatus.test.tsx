// Runs against the real WP4 OfflineBanner, so it is red until the branch is synced with team/wp4-primitives-b.
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ShellStatus } from './ShellStatus'
import type { Connectivity } from './useConnectivity'

let connectivity: Connectivity
vi.mock('./useConnectivity', () => ({ useConnectivity: () => connectivity }))

beforeEach(() => {
  connectivity = { offline: false, savedAt: null }
})

describe('ShellStatus', () => {
  it('renders nothing while online', () => {
    render(<ShellStatus pendingScans={4} />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('offline: shows the saved-at time (24 h) and the Scans waiting to sync', () => {
    connectivity = { offline: true, savedAt: new Date(2026, 10, 10, 14, 2) }
    render(<ShellStatus pendingScans={3} />)
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent('Offline')
    expect(banner).toHaveTextContent('14:02')
    expect(banner).toHaveTextContent('3 Scans waiting to sync')
  })

  it('offline with nothing queued: no waiting line', () => {
    connectivity = { offline: true, savedAt: new Date(2026, 10, 10, 14, 2) }
    render(<ShellStatus />)
    expect(screen.getByRole('status')).not.toHaveTextContent(/waiting to sync/)
  })
})
