import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_ME, mockApi, renderWithProviders, USER_ME } from '../test-utils'
import { SettingsIndexPage } from './SettingsIndexPage'

afterEach(() => vi.unstubAllGlobals())

describe('SettingsIndexPage (/settings, 5.14)', () => {
  it('is a short index: heading, three grouped lists of icon rows (Catalogue, Household, You), no form controls', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME })
    renderWithProviders(<SettingsIndexPage />, '/settings')
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    for (const group of ['Catalogue', 'Household', 'You']) expect(await screen.findByRole('list', { name: group })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Admin' })).toBeNull()
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
    expect(screen.queryAllByRole('slider')).toHaveLength(0)
    expect(document.querySelector('input, select, textarea')).toBeNull()
  })

  it('links every row to its own page', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME })
    renderWithProviders(<SettingsIndexPage />, '/settings')
    const expected: Record<string, string> = {
      Ingredients: '/ingredients',
      Products: '/products',
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
      'Recipe Assistant': '/settings/recipe-assistant',
    }
    for (const [name, href] of Object.entries(expected)) {
      expect(await screen.findByRole('link', { name })).toHaveAttribute('href', href)
    }
  })

  it('puts the rows in their group, in order; the Admins-only rows close Household', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME })
    renderWithProviders(<SettingsIndexPage />, '/settings')
    const names = (list: HTMLElement) => within(list).getAllByRole('link').map((a) => a.getAttribute('aria-label'))
    expect(names(await screen.findByRole('list', { name: 'Catalogue' }))).toEqual(['Ingredients', 'Products', 'Shops', 'Tags', 'Courses', 'Storage Places'])
    expect(names(await screen.findByRole('list', { name: 'Household' }))).toEqual(['Household', 'Members', 'Meal Slots', 'Planning rules', 'Sign-in requests', 'Allowlist', 'Recipe Assistant'])
    expect(names(await screen.findByRole('list', { name: 'You' }))).toEqual(['Your preferences', 'Notifications'])
  })

  it('lists the groups in the order Catalogue, Household, You', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME })
    renderWithProviders(<SettingsIndexPage />, '/settings')
    await screen.findByRole('list', { name: 'You' })
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Catalogue', 'Household', 'You'])
  })

  it('hides the Allowlist and the Recipe Assistant from a plain User, who sees Catalogue, Household and You', async () => {
    mockApi({ 'GET /api/me': USER_ME })
    renderWithProviders(<SettingsIndexPage />, '/settings')
    expect(await screen.findByRole('link', { name: 'Your preferences' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Allowlist' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Recipe Assistant' })).toBeNull()
    expect(screen.queryByRole('list', { name: 'Admin' })).toBeNull()
    for (const group of ['Catalogue', 'Household', 'You']) expect(screen.getByRole('list', { name: group })).toBeInTheDocument()
  })

  it('shows no more than a title and one line of meta per row (no inline forms or paragraphs of help)', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME })
    renderWithProviders(<SettingsIndexPage />, '/settings')
    const row = (await screen.findByRole('link', { name: 'Shops' })).closest('li')!
    expect(row).toHaveTextContent('Shops')
    expect((row.textContent ?? '').length).toBeLessThan(80)
  })
})
