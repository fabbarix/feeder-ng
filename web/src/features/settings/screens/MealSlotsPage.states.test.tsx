// B9-20 (RES-02) on the Meal Slots page: one screen per state. Unknown is not empty; a failure is not an empty list; a loading page has
// skeleton tiles, not a "Loading" line.
import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { householdSettings, anna, marco, tuesdayDinner } from '../components/fixtures'
import { ADMIN_ME, mockApi, renderWithProviders } from '../test-utils'
import { MealSlotsPage } from './MealSlotsPage'

beforeEach(() => vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.dispatchEvent(new Event('online'))
})
const base = { 'GET /api/me': ADMIN_ME, 'GET /api/household/settings': householdSettings, 'GET /api/members': [anna, marco], 'GET /api/meal-slots?removed=with-history': [] }

describe('MealSlotsPage: states', () => {
  it('while loading it shows skeleton cards (a skeleton is a status once shown) and no "Loading" paragraph', () => {
    mockApi({ ...base, 'GET /api/meal-slots': () => new Promise(() => {}) })
    const { container } = renderWithProviders(<MealSlotsPage />)
    expect(container.querySelector('.skeleton')).not.toBeNull()
    expect(screen.queryByText('Loading…')).toBeNull()
    expect(screen.queryByText('Loading')).toBeNull()
  })
  it('an empty household is the empty state, with the page\'s Add Meal Slot still in the header', async () => {
    mockApi({ ...base, 'GET /api/meal-slots': [] })
    renderWithProviders(<MealSlotsPage />)
    expect(await screen.findByText('No Meal Slots yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Meal Slot' })).toBeInTheDocument()
  })
  it('a failed read is an alert with Try again, never "No Meal Slots yet"', async () => {
    mockApi({ ...base, 'GET /api/meal-slots': { status: 403, json: { error: { code: 'forbidden', message: 'No' } } } })
    renderWithProviders(<MealSlotsPage />)
    expect(await screen.findByRole('alert', {})).toHaveTextContent(/Meal Slots could not be loaded/)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByText('No Meal Slots yet')).toBeNull()
  })
  it('offline with nothing ever loaded is LoadState: "Your Meal Slots aren’t on this phone yet", never an empty state', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    const { container } = renderWithProviders(<MealSlotsPage />)
    expect(await screen.findByRole('heading', { name: 'Your Meal Slots aren’t on this phone yet' })).toBeInTheDocument()
    expect(screen.getByText(/They’ll appear here as soon as the connection is back\./)).toBeInTheDocument()
    expect(container.querySelector('.load-state')).not.toBeNull()
    expect(screen.queryByText('No Meal Slots yet')).toBeNull()
  })
  it('ready shows the cards', async () => {
    mockApi({ ...base, 'GET /api/meal-slots': [tuesdayDinner] })
    renderWithProviders(<MealSlotsPage />)
    expect(await screen.findByRole('region', { name: 'Dinner' })).toBeInTheDocument()
  })
})
