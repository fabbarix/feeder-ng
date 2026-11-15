// B9-53 (TB-06, step 3): "Set up by hand" in the Meal Slot quick start opens /settings/meal-slots?add=1&weekdays=1,2,3,4,5,6,7, and the page opens
// the Add Meal Slot editor with every weekday preselected (the existing "add" editor, `defaultWeekdays`). The query is then cleared, so Back or a reload
// does not open it again.
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { anna, householdSettings, marco, sam } from '../components/fixtures'
import { ADMIN_ME, mockApi, renderWithProviders } from '../test-utils'
import { MealSlotsPage } from './MealSlotsPage'
import { stubViewportWidth } from '../../../ui/lib/viewport.test-helper'

afterEach(() => vi.unstubAllGlobals())

function open(route: string) {
  stubViewportWidth(390)
  mockApi({ 'GET /api/me': ADMIN_ME, 'GET /api/household/settings': householdSettings, 'GET /api/members': [anna, marco, sam], 'GET /api/meal-slots': [] })
  return renderWithProviders(<MealSlotsPage />, route)
}

describe('MealSlotsPage: arriving from the first-run checklist', () => {
  it('opens the Add Meal Slot editor with all seven weekdays chosen', async () => {
    open('/settings/meal-slots?add=1&weekdays=1,2,3,4,5,6,7')
    const dialog = await screen.findByRole('dialog', { name: /Add Meal Slot/ })
    const days = within(dialog).getAllByRole('button', { pressed: true }) // the WeekdayPicker chips are aria-pressed buttons
    expect(days.length).toBeGreaterThanOrEqual(7)
  })

  it('without the query nothing opens', async () => {
    open('/settings/meal-slots')
    await waitFor(() => expect(screen.getByRole('heading', { name: /Meal Slots/ })).toBeInTheDocument())
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
