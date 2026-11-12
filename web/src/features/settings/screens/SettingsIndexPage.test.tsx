import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_ME, mockApi, renderWithProviders, USER_ME } from '../test-utils'
import { SettingsIndexPage } from './SettingsIndexPage'

afterEach(() => vi.unstubAllGlobals())

describe('SettingsIndexPage (/settings, 5.14)', () => {
  it('is a short index: heading, three grouped lists of icon rows, no form controls', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME })
    renderWithProviders(<SettingsIndexPage />, '/settings')
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    for (const group of ['Household', 'You', 'Admin']) expect(await screen.findByRole('list', { name: group })).toBeInTheDocument()
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
    expect(screen.queryAllByRole('slider')).toHaveLength(0)
    expect(document.querySelector('input, select, textarea')).toBeNull()
  })

  it('links every row to its own page', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME })
    renderWithProviders(<SettingsIndexPage />, '/settings')
    const expected: Record<string, string> = {
      Household: '/settings/household',
      Members: '/settings/members',
      'Meal Slots': '/settings/meal-slots',
      Courses: '/settings/courses',
      'Planning rules': '/settings/planning',
      Tags: '/settings/tags',
      Shops: '/settings/shops',
      'Storage Places': '/settings/storage-places',
      'Sign-in requests': '/settings/access-requests',
      'Your preferences': '/settings/preferences',
      Notifications: '/settings/notifications',
      Allowlist: '/settings/allowlist',
    }
    for (const [name, href] of Object.entries(expected)) {
      expect(await screen.findByRole('link', { name })).toHaveAttribute('href', href)
    }
  })

  it('puts the rows in their group', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME })
    renderWithProviders(<SettingsIndexPage />, '/settings')
    const household = await screen.findByRole('list', { name: 'Household' })
    expect(within(household).getAllByRole('link').map((a) => a.getAttribute('aria-label'))).toEqual(['Household', 'Members', 'Meal Slots', 'Courses', 'Planning rules', 'Tags', 'Shops', 'Storage Places', 'Sign-in requests'])
    expect(within(await screen.findByRole('list', { name: 'You' })).getAllByRole('link')).toHaveLength(2)
    expect(within(await screen.findByRole('list', { name: 'Admin' })).getAllByRole('link').map((a) => a.getAttribute('aria-label'))).toEqual(['Allowlist', 'Recipe Assistant'])
  })

  it('hides the Allowlist, and the Admin group, from a plain User', async () => {
    mockApi({ 'GET /api/me': USER_ME })
    renderWithProviders(<SettingsIndexPage />, '/settings')
    expect(await screen.findByRole('link', { name: 'Your preferences' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Allowlist' })).toBeNull()
    expect(screen.queryByRole('list', { name: 'Admin' })).toBeNull()
  })

  it('shows no more than a title and one line of meta per row (no inline forms or paragraphs of help)', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME })
    renderWithProviders(<SettingsIndexPage />, '/settings')
    const row = (await screen.findByRole('link', { name: 'Shops' })).closest('li')!
    expect(row).toHaveTextContent('Shops')
    expect((row.textContent ?? '').length).toBeLessThan(80)
  })
})
