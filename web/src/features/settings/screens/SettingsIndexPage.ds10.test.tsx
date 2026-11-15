// B9-51 (DS-10, P28): the Settings hub's descriptions take up to two lines (metaLines={2}) and none is longer than two lines can hold.
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_ME, mockApi, renderWithProviders } from '../test-utils'
import { settingsStrings } from '../strings'
import { SettingsIndexPage } from './SettingsIndexPage'

afterEach(() => vi.unstubAllGlobals())

describe('Settings hub descriptions (DS-10)', () => {
  it('every row is a navigation row with a two-line description (data-meta-lines="2")', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME })
    renderWithProviders(<SettingsIndexPage />, '/settings')
    await screen.findByRole('heading', { level: 1, name: 'Settings' })
    const rows = [...document.querySelectorAll('main .list-row, .settings .list-row')]
    expect(rows.length).toBeGreaterThanOrEqual(14)
    for (const row of rows) expect(row, row.textContent ?? '').toHaveAttribute('data-meta-lines', '2')
  })

  it('no description is longer than 60 characters (two lines at 375 px, also with text spacing)', () => {
    for (const [id, section] of Object.entries(settingsStrings.index.sections)) expect(section.meta.length, id).toBeLessThanOrEqual(60)
  })

  it('Planning rules says where the Cooking times are', () => {
    expect(settingsStrings.index.sections.planningRules.meta).toMatch(/Cooking times/)
  })
  // Review (w4c): each description names what is on its page. Planner Style, Cool-down and the Use-by days are in the Household
  // form, not on Planning rules (the DS-10 mock's copy predates the Cooking times tile and named them there).
  it('Planning rules names its own tiles, and Household names the Planner Style', () => {
    expect(settingsStrings.index.sections.planningRules.meta).toBe('Cooking times, Slot Rules, Variety Rules')
    expect(settingsStrings.index.sections.household.meta).toMatch(/Planner Style/)
  })
})
