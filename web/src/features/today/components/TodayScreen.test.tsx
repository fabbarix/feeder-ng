import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import { todayStrings } from '../strings'
import { TodayScreen } from './TodayScreen'
import { findToast } from '../../../test/notices'

const h = vi.hoisted(() => ({
  session: null as null | { shopId: number; shopName: string; scanned: number; lastScanAt: number; end: () => Promise<void>; resume: () => void },
  householdDate: null as string | null,
  throwOut: vi.fn<(id: number) => Promise<void>>(),
  keep: vi.fn<(id: number) => Promise<void>>(),
  planToday: '2026-11-09',
  failed: false,
}))

// The seams are the only place Today reads other features; the spoiled tile is stubbed to one button.
vi.mock('../seams', () => ({
  useScanSessionActive: () => false,
  useTodayPlan: () => ({ hasNextMeal: false, toConfirm: 0, couldntPlan: 0, leftovers: 0, loading: false, failed: h.failed }),
  useTodayStock: () => ({ spoiled: 1, useSoon: [], loading: false }),
  useTodayTileData: () => ({
    now: new Date(),
    nextSlot: null,
    toConfirm: [],
    couldntPlan: [],
    leftovers: [],
    planToday: h.planToday,
    loadFailed: h.failed,
    spoiled: [{ id: 7 }],
    stockToday: '2026-11-09',
    system: 'metric',
    useSoon: [],
    throwOut: h.throwOut,
    keep: h.keep,
    // B9-44 (SAFE-09, SSP-17): Today runs the Pantry's spoiled flow (Keep with Change and Undo, Throw out with Undo) on these calls.
    spoiledCalls: { throwOut: h.throwOut, keep: h.keep, undoThrowOut: vi.fn(), undoKeep: vi.fn() },
    planLoading: false,
    stockLoading: false,
  }),
  ShoppingListSeam: () => createElement('p', null, 'The Shopping List'),
}))

vi.mock('../../stock', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../stock')>()),
  SpoiledTile: (p: { onThrowOut: (id: number) => void }) => createElement('button', { onClick: () => p.onThrowOut(7) }, 'Throw out'),
}))
vi.mock('../shoppingSeam', () => ({ useShoppingSession: () => h.session }))
vi.mock('../../../app/useHouseholdDate', () => ({ useHouseholdDate: () => h.householdDate }))

function setup() {
  mockApi({ 'GET /api/today/advance-steps': { steps: [] }, 'GET /api/today/streak': { days: 0 } })
  return renderWithProviders(createElement(TodayScreen))
}

afterEach(() => {
  h.session = null
  h.householdDate = null
  h.planToday = '2026-11-09'
  h.failed = false
  h.throwOut.mockReset()
  vi.unstubAllGlobals()
})

describe('TodayScreen', () => {
  // B9-44 (TB-12, changed on purpose): a Scan session adds the "Shopping at <Shop>" tile first; Today and its tiles stay.
  it('adds the Shopping tile first while a scan session is active, and keeps Today under it', async () => {
    h.session = { shopId: 7, shopName: 'Coop', scanned: 3, lastScanAt: Date.now() - 60_000, end: vi.fn(async () => {}), resume: vi.fn() }
    setup()
    expect(await screen.findByRole('region', { name: 'Shopping at Coop' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Today' })).toBeTruthy()
    expect(screen.queryByText('The Shopping List')).toBeNull()
  })

  it('shows the tiles, not the Shopping List, when no scan session is active', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeTruthy()
    expect(screen.queryByText('The Shopping List')).toBeNull()
  })

  it('surfaces a failed throw out in a toast instead of swallowing it', async () => {
    h.throwOut.mockRejectedValue(new Error('server said no'))
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Throw out' }))
    expect(await findToast(todayStrings.actionFailed)).toBeTruthy()
    expect(h.throwOut).toHaveBeenCalledWith(7)
  })

  // B9-44 (RES-05, changed on purpose): the date is the Household's, never the device's; with no zone known yet it is a skeleton.
  it('dates the header from the Household date before the plan has loaded, never from the device clock', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 8, 23) })
    h.planToday = ''
    h.householdDate = '2026-11-09'
    setup()
    expect(await screen.findByText('Mon 9 Nov')).toBeTruthy()
    expect(screen.queryByText('Sun 8 Nov')).toBeNull()
    vi.useRealTimers()
  })

  it('shows a reserved skeleton, not a date, when the Household date is not known yet (first launch ever)', async () => {
    h.planToday = ''
    h.householdDate = null
    const { container } = setup()
    await screen.findByRole('heading', { name: 'Today' })
    expect(container.querySelector('.page-header__subtitle .skeleton')).not.toBeNull()
    expect(screen.queryByText(/NaN|Invalid/)).toBeNull()
  })

  it('shows a load error, not the empty state, when the data could not be loaded', async () => {
    h.failed = true
    setup()
    expect(await screen.findByText('Today could not be loaded.')).toBeTruthy()
    expect(screen.queryByText(todayStrings.emptyTitle)).toBeNull()
  })
})
