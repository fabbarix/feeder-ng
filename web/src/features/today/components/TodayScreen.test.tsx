import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import { todayStrings } from '../strings'
import { TodayScreen } from './TodayScreen'

const h = vi.hoisted(() => ({
  scan: false,
  throwOut: vi.fn<(id: number) => Promise<void>>(),
  keep: vi.fn<(id: number) => Promise<void>>(),
}))

// The seams are the only place Today reads other features; the spoiled tile is stubbed to one button.
vi.mock('../seams', () => ({
  useScanSessionActive: () => h.scan,
  useTodayPlan: () => ({ hasNextMeal: false, toConfirm: 0, couldntPlan: 0, leftovers: 0, loading: false }),
  useTodayStock: () => ({ spoiled: 1, useSoon: [], loading: false }),
  useTodayTileData: () => ({
    nextSlot: null,
    toConfirm: [],
    couldntPlan: [],
    leftovers: [],
    planToday: '2026-11-09',
    spoiled: [{ id: 7 }],
    stockToday: '2026-11-09',
    system: 'metric',
    useSoon: [],
    throwOut: h.throwOut,
    keep: h.keep,
    planLoading: false,
    stockLoading: false,
  }),
  ShoppingListSeam: () => createElement('p', null, 'The Shopping List'),
}))

vi.mock('../../stock', () => ({
  SpoiledTile: (p: { onThrowOut: (id: number) => void }) => createElement('button', { onClick: () => p.onThrowOut(7) }, 'Throw out'),
}))

function setup() {
  mockApi({ 'GET /api/today/advance-steps': { steps: [] }, 'GET /api/today/streak': { days: 0 } })
  return renderWithProviders(createElement(TodayScreen))
}

afterEach(() => {
  h.scan = false
  h.throwOut.mockReset()
  vi.unstubAllGlobals()
})

describe('TodayScreen', () => {
  it('switches to the Shopping List while a scan session is active', async () => {
    h.scan = true
    setup()
    expect(await screen.findByText('The Shopping List')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Today' })).toBeNull()
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
    expect(await screen.findByText(todayStrings.actionFailed)).toBeTruthy()
    expect(h.throwOut).toHaveBeenCalledWith(7)
  })
})
