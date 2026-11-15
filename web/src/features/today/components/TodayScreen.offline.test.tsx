// B9-39 (B9-20 follow-up, RES-02): Today opened offline BEFORE its first load says the plan is not on this phone yet (a LoadState), never "Today could
// not be loaded." with a Try again that cannot work; and no tile shows a number from nowhere (the Shop's "Lines to get"). Real seams, real hooks.
// The copy is the chapter's: "Today’s plan isn’t on this phone yet" / "It will appear as soon as the connection is back." (res.md, RES-02 table).
import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { advance, goOffline, mountScreen, serverDown } from '../../../test/offlineHarness'
import { TodayScreen } from './TodayScreen'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.dispatchEvent(new Event('online'))
})

describe('Today offline, never loaded', () => {
  it('shows one LoadState "Today’s plan isn’t on this phone yet", with the date header, and no error', async () => {
    goOffline()
    const { container } = mountScreen(<TodayScreen />, '/')
    await advance(500)
    expect(container.querySelectorAll('.load-state')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Today’s plan isn’t on this phone yet' })).toBeInTheDocument()
    expect(screen.getByText('It will appear as soon as the connection is back.')).toBeInTheDocument()
    expect(screen.getByText('Waiting for a connection')).toBeInTheDocument()
    expect(container.querySelector('.error-state')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(container.textContent).not.toMatch(/could not be loaded/i)
  })

  it('shows no empty state ("Nothing on the menu") and no tile, and no Lines to get number', async () => {
    goOffline()
    const { container } = mountScreen(<TodayScreen />, '/')
    await advance(500)
    expect(container.querySelector('.empty-state')).toBeNull()
    expect(container.textContent).not.toMatch(/Nothing on the menu|Lines to get/)
    expect(container.querySelector('[data-tile]')).toBeNull()
  })

  it('stays so after the retry window (no flip to an error after seconds)', async () => {
    goOffline()
    const { container } = mountScreen(<TodayScreen />, '/')
    await advance(12_000)
    expect(container.querySelectorAll('.load-state')).toHaveLength(1)
    expect(container.querySelector('.error-state')).toBeNull()
  })

  it('online with the server down is still the error with Try again (a retry can work)', async () => {
    serverDown(500)
    const { container } = mountScreen(<TodayScreen />, '/')
    await advance(8_000)
    expect(container.querySelector('.error-state')).not.toBeNull()
    expect(container.querySelector('.load-state')).toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
