// A Step starts once the Steps in its `after` have finished: Next is held while their timers count down, and cancelling
// the timer frees it ("Put the meat in the oven" waits for "Pre-heat the oven").
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../../plan/test-utils'
import type { CookTimer, CookView } from '../types'
import { CookScreen } from './CookScreen'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))

const scope = 'meal:2026-11-09/2'
function view(after: number[]): CookView {
  return {
    scope, recipeId: 7, recipeName: 'Roast beef', batches: 1, meal: { date: '2026-11-09', mealSlotId: 2 }, today: '2026-11-09', advance: [], timers: [],
    steps: [
      { index: 0, number: 1, of: 2, kind: 'passive', text: 'Pre-heat the oven', durationMinutes: 15, imageUrl: '', uses: [], timer: { label: 'Step 1 · Pre-heat the oven', durationSeconds: 900 }, after: [] },
      { index: 1, number: 2, of: 2, kind: 'active', text: 'Put the meat in the oven', durationMinutes: 5, imageUrl: '', uses: [], timer: null, after },
    ],
  }
}

function preheat(state: CookTimer['state'] = 'running'): CookTimer {
  const now = Date.now()
  return {
    id: 41, scope, step: 0, recipeName: 'Roast beef', label: 'Step 1 · Pre-heat the oven', durationSeconds: 900, state,
    remainingSeconds: 252, endsAt: state === 'running' ? new Date(now + 252_000).toISOString() : null, startedAt: new Date(now - 648_000).toISOString(),
  }
}

function setup(after: number[], timer: CookTimer | null) {
  let current = timer ? [timer] : []
  const api = mockApi({
    'GET /api/cook/meals/2026-11-09/2': view(after),
    'GET /api/cook/timers': () => ({ now: new Date().toISOString(), timers: current }),
    'POST /api/cook/timers': () => current[0] ?? preheat(),
    'DELETE /api/cook/timers/41': () => {
      current = []
      return { status: 204 }
    },
  })
  renderWithProviders(
    <Routes>
      <Route path="/cook/meal/:date/:slotId" element={<CookScreen />} />
    </Routes>,
    '/cook/meal/2026-11-09/2',
  )
  return api
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', undefined)
})

describe('CookScreen: Next waits for the Steps the next Step depends on', () => {
  it('holds Next while the pre-heat timer runs and says why; cancelling the timer frees it', async () => {
    setup([0], preheat())
    expect(await screen.findByText('Pre-heat the oven')).toBeInTheDocument()
    const next = await screen.findByRole('button', { name: 'Next' })
    await waitFor(() => expect(next).toBeDisabled())
    expect(screen.getByText(/Next waits for Step 1 · Pre-heat the oven: 4:1\d left\. Cancel its timer to go on now\./)).toBeInTheDocument()
    expect(next).toHaveAccessibleDescription(/Next waits for Step 1 · Pre-heat the oven/)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel Step 1 · Pre-heat the oven' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
    expect(screen.queryByText(/Next waits for/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Put the meat in the oven')).toBeInTheDocument()
  })

  it('a paused pre-heat timer still holds Next', async () => {
    setup([0], preheat('paused'))
    const next = await screen.findByRole('button', { name: 'Next' })
    await waitFor(() => expect(next).toBeDisabled())
  })

  it('a finished pre-heat timer (the oven is hot) frees Next', async () => {
    setup([0], { ...preheat('finished'), remainingSeconds: 0 })
    expect(await screen.findByText('Pre-heat the oven')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
  })

  it('a Step that does not wait for the pre-heat can be reached while it runs', async () => {
    setup([], preheat())
    expect(await screen.findByText('Pre-heat the oven')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
  })
})
