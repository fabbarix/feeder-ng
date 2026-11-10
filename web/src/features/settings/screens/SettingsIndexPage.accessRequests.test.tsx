// A1 phase 2: the Settings index has a "Sign-in requests" row (Household group, every User) that leads to
// /settings/access-requests and carries the pending count: the meta line and an AccessBadge ("3 sign-in requests waiting").
// The count comes from the access feature's useAccessBadge (GET /api/access-requests), so a plain User gets it too.
import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_ME, mockApi, renderWithProviders, USER_ME } from '../test-utils'
import { SettingsIndexPage } from './SettingsIndexPage'

afterEach(() => vi.unstubAllGlobals())

const waiting = (count: number) => ({ requests: [], count })

describe('SettingsIndexPage: Sign-in requests row', () => {
  it('links to /settings/access-requests, for an Admin and for a plain User', async () => {
    for (const me of [ADMIN_ME, USER_ME]) {
      mockApi({ 'GET /api/me': me, 'GET /api/access-requests': waiting(0) })
      const { unmount } = renderWithProviders(<SettingsIndexPage />, '/settings')
      expect(await screen.findByRole('link', { name: 'Sign-in requests' })).toHaveAttribute('href', '/settings/access-requests')
      unmount()
    }
  })

  it('sits in the Household group, last', async () => {
    mockApi({ 'GET /api/me': USER_ME, 'GET /api/access-requests': waiting(0) })
    renderWithProviders(<SettingsIndexPage />, '/settings')
    const household = await screen.findByRole('list', { name: 'Household' })
    expect(within(household).getAllByRole('link').at(-1)).toHaveAttribute('aria-label', 'Sign-in requests')
  })

  it('shows the pending count as meta and as a badge', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME, 'GET /api/access-requests': waiting(3) })
    renderWithProviders(<SettingsIndexPage />, '/settings')
    const row = (await screen.findByRole('link', { name: 'Sign-in requests' })).closest('li')!
    expect(await within(row).findByText('3 waiting')).toBeInTheDocument()
    expect(within(row).getByRole('img', { name: '3 sign-in requests waiting' })).toBeInTheDocument()
  })

  it('shows no badge and no number when nobody waits', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME, 'GET /api/access-requests': waiting(0) })
    renderWithProviders(<SettingsIndexPage />, '/settings')
    const row = (await screen.findByRole('link', { name: 'Sign-in requests' })).closest('li')!
    expect(within(row).queryByRole('img')).toBeNull()
    expect(row.textContent).not.toMatch(/\d/)
  })

  it('still shows the row (without a count) when the count cannot load', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME, 'GET /api/access-requests': { status: 500, json: { error: { code: 'internal', message: 'x' } } } })
    renderWithProviders(<SettingsIndexPage />, '/settings')
    const row = (await screen.findByRole('link', { name: 'Sign-in requests' })).closest('li')!
    expect(within(row).queryByRole('img')).toBeNull()
  })
})
