// B9-20 (RES-02), reviewer: every Settings page, offline and never loaded, says so; it never shows "Loading" forever, an
// empty list or the default preferences. Online, a failing read shows the error with Try again in about 1 s.
import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeCachedMe } from '../../app/meCache'
import { advance, goOffline, mountScreen, serverDown } from '../../test/offlineHarness'
import { AllowlistPage } from './screens/AllowlistPage'
import { CoursesPage } from './screens/CoursesPage'
import { HouseholdPage } from './screens/HouseholdPage'
import { MealSlotsPage } from './screens/MealSlotsPage'
import { PreferencesPage } from './screens/PreferencesPage'

const TITLE = 'Your settings aren’t on this phone yet'
const PAGES: Array<[string, React.ReactElement, string]> = [
  ['Meal Slots', <MealSlotsPage />, '/settings/meal-slots'],
  ['Household', <HouseholdPage />, '/settings/household'],
  ['Courses', <CoursesPage />, '/settings/courses'],
  ['Your preferences', <PreferencesPage />, '/settings/preferences'],
  ['Allowlist (an Admin)', <AllowlistPage />, '/settings/allowlist'],
]

beforeEach(() => {
  vi.useFakeTimers()
  writeCachedMe({ id: 1, email: 'admin@example.test', displayName: 'Admin', isAdmin: true })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe.each(PAGES)('%s', (_name, element, path) => {
  it('offline and never loaded: one LoadState, no Loading line, no form, no error', async () => {
    goOffline()
    const { container } = mountScreen(element, path)
    await advance(12_000)
    expect(container.querySelectorAll('.load-state')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: TITLE })).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/Loading/)
    expect(container.querySelector('form, .error-state, .empty-state')).toBeNull()
  })

  it('online, a 500: the error with Try again within 2 s', async () => {
    window.dispatchEvent(new Event('online')) // the earlier offline case left the query layer offline
    serverDown(500)
    const { container } = mountScreen(element, path)
    await advance(1900)
    expect(container.querySelector('.error-state')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
