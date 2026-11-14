// B9-10 (DS-07, drift item 6): the group titles of /settings were `h2.settings__overline`, which the DS-07 base heading turned into an
// 18/22, 800 heading with a 0.8rem override. The Overline primitive of ui replaces it: the overline look (12/16, 800, caps, muted colour),
// never an opacity. Each group is still named for assistive tech by its list (ListGroup label).
import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_ME, mockApi, renderWithProviders } from '../test-utils'
import { SettingsIndexPage } from './SettingsIndexPage'

afterEach(() => vi.unstubAllGlobals())

describe('SettingsIndexPage group titles (DS-07)', () => {
  it('Catalogue, Household and You are Overline text, not h2.settings__overline', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME })
    const { container } = renderWithProviders(<SettingsIndexPage />, '/settings')
    await screen.findByRole('list', { name: 'Catalogue' })
    expect(container.querySelector('.settings__overline')).toBeNull()
    const overlines = [...container.querySelectorAll('.overline')].map((e) => e.textContent)
    expect(overlines).toEqual(expect.arrayContaining(['Catalogue', 'Household', 'You']))
    for (const e of container.querySelectorAll('.overline')) expect(e.tagName).toMatch(/^(P|SPAN)$/)
  })
  it('each group is still a named list of its rows', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME })
    renderWithProviders(<SettingsIndexPage />, '/settings')
    for (const group of ['Catalogue', 'Household', 'You']) {
      const list = await screen.findByRole('list', { name: group })
      expect(within(list).getAllByRole('link').length).toBeGreaterThan(0)
    }
  })
  it('the page has one heading: its title (the groups are not headings of the document outline)', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME })
    renderWithProviders(<SettingsIndexPage />, '/settings')
    await screen.findByRole('list', { name: 'Catalogue' })
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Settings'])
  })
})
