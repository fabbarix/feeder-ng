import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findNotice } from '../../../test/notices'
import { courseMeal, meal, mockApi, planCourse, renderWithProviders } from '../../plan/test-utils'
import { serverSlot } from '../../plan/test-utils.c3'
import type { CookedResult, CookPreview, PlanView } from '../../plan/types'
import type { CookTimer } from '../types'
import { ReheatScreen } from './ReheatScreen'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))

const SCOPE = 'meal:2026-11-10/2/1'
const source = { leftoverId: 4, date: '2026-11-09', mealSlotId: 2, recipeName: 'Chicken curry' }
const planView = (over: Parameters<typeof meal>[0] = {}): PlanView => ({
  today: '2026-11-10', horizonDays: 7, updating: false,
  slots: [serverSlot([planCourse({ courseId: 1, main: true, name: 'Main', meal: courseMeal(1, 'Main', { recipeName: 'Chicken curry', portions: 2, servedFromLeftover: source, ...over }) })], { date: '2026-11-10', mealSlotId: 2, name: 'Dinner' })],
})
const timers = (list: CookTimer[] = []) => ({ now: '2026-11-10T18:00:00Z', timers: list })
const running: CookTimer = {
  id: 5, scope: SCOPE, step: null, label: 'Reheat', durationSeconds: 180, state: 'running', remainingSeconds: 150,
  endsAt: '2026-11-10T18:02:30Z', startedAt: '2026-11-10T18:00:00Z',
}
const preview: CookPreview = {
  meal: meal({ servedFromLeftover: source }), fresh: false, batches: 0, yield: 0, portionsNeeded: 2, proposedLeftover: 0, maxLeftover: 0, leftoverUseBy: '', needs: [],
}
const cooked: CookedResult = { meal: meal({ state: 'cooked' }), leftover: null, warnings: [], plannedFor: [] }

const base = () => ({ 'GET /api/plan': planView(), 'GET /api/cook/timers': timers() })

function renderReheat() {
  return renderWithProviders(
    <Routes>
      <Route path="/cook/reheat/:date/:slotId/:courseId" element={<ReheatScreen />} />
      <Route path="/" element={<p>Home page</p>} />
    </Routes>,
    '/cook/reheat/2026-11-10/2/1',
  )
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', undefined)
})

describe('ReheatScreen (R12)', () => {
  it('shows the Recipe, the default time for the portions and the controls', async () => {
    mockApi(base())
    renderReheat()
    expect(await screen.findByRole('heading', { name: 'Chicken curry' })).toBeInTheDocument()
    expect(screen.getByText('3:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start timer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark as Cooked' })).toBeInTheDocument()
  })

  it('the time is adjustable by 30 seconds before the timer starts', async () => {
    mockApi(base())
    renderReheat()
    await userEvent.click(await screen.findByRole('button', { name: 'Add 30 seconds' }))
    expect(screen.getByText('3:30')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove 30 seconds' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove 30 seconds' }))
    expect(screen.getByText('2:30')).toBeInTheDocument()
  })

  it('Start timer posts a Reheat timer scoped to the Planned Meal', async () => {
    const api = mockApi({ ...base(), 'POST /api/cook/timers': { status: 201, json: running } })
    renderReheat()
    await userEvent.click(await screen.findByRole('button', { name: 'Start timer' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/cook/timers')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/cook/timers')[0]!.body).toEqual({ scope: SCOPE, label: 'Reheat', durationSeconds: 180 })
  })

  it('a running Reheat timer shows Pause and Cancel timer instead of Start', async () => {
    mockApi({ ...base(), 'GET /api/cook/timers': timers([running]) })
    renderReheat()
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel timer' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start timer' })).not.toBeInTheDocument()
  })

  it('Cancel timer deletes the timer and keeps the screen', async () => {
    const api = mockApi({ ...base(), 'GET /api/cook/timers': timers([running]), 'DELETE /api/cook/timers/5': { status: 204 } })
    renderReheat()
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel timer' }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/cook/timers/5')).toHaveLength(1))
    expect(screen.queryByText('Home page')).not.toBeInTheDocument()
  })

  it('Mark as Cooked marks the meal Cooked in one go (no Leftover portions sent) and leaves for Today', async () => {
    const api = mockApi({ ...base(), 'GET /api/plan/2026-11-10/2/1/cook': preview, 'POST /api/plan/2026-11-10/2/1/cooked': cooked })
    renderReheat()
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as Cooked' }))
    expect(await screen.findByText('Home page')).toBeInTheDocument()
    const posts = api.callsTo('POST', '/api/plan/2026-11-10/2/1/cooked')
    expect(posts).toHaveLength(1)
    expect(posts[0]!.body).toEqual({})
  })

  it('a failed Mark as Cooked says so, stays on the screen and changes nothing', async () => {
    mockApi({ ...base(), 'GET /api/plan/2026-11-10/2/1/cook': preview, 'POST /api/plan/2026-11-10/2/1/cooked': { status: 500, json: { error: { code: 'internal', message: 'x' } } } })
    renderReheat()
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as Cooked' }))
    expect(await findNotice('alert', 'That could not be saved. Nothing was changed.')).toBeInTheDocument()
    expect(screen.queryByText('Home page')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark as Cooked' })).toBeInTheDocument()
  })

  it('Exit leaves for Today and leaves a running timer alone', async () => {
    const api = mockApi({ ...base(), 'GET /api/cook/timers': timers([running]) })
    renderReheat()
    await userEvent.click(await screen.findByRole('button', { name: 'Exit' }))
    expect(await screen.findByText('Home page')).toBeInTheDocument()
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it('a Planned Meal that is not served from a Leftover, or is already Cooked, is explained', async () => {
    mockApi({ ...base(), 'GET /api/plan': planView({ servedFromLeftover: null }) })
    renderReheat()
    expect(await screen.findByText('This Planned Meal is not served from a Leftover')).toBeInTheDocument()
  })

  it('an already Cooked meal shows the not-cookable explanation', async () => {
    mockApi({ ...base(), 'GET /api/plan': planView({ state: 'cooked' }) })
    renderReheat()
    expect(await screen.findByText('This Planned Meal has already been cooked or skipped')).toBeInTheDocument()
  })

  it('a finished Reheat timer says it is ready and offers Dismiss, which deletes it', async () => {
    const finished: CookTimer = { ...running, state: 'finished', remainingSeconds: 0 }
    const api = mockApi({ ...base(), 'GET /api/cook/timers': timers([finished]), 'DELETE /api/cook/timers/5': { status: 204 } })
    renderReheat()
    expect(await screen.findByText('Reheat is ready')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel timer' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/cook/timers/5')).toHaveLength(1))
  })

  it('a paused Reheat timer offers Resume', async () => {
    mockApi({ ...base(), 'GET /api/cook/timers': timers([{ ...running, state: 'paused' }]) })
    renderReheat()
    expect(await screen.findByRole('button', { name: 'Resume' })).toBeInTheDocument()
  })

  it('a failed Start timer shows the error toast', async () => {
    mockApi({ ...base(), 'POST /api/cook/timers': { status: 500, json: { error: { code: 'internal', message: 'x' } } } })
    renderReheat()
    await userEvent.click(await screen.findByRole('button', { name: 'Start timer' }))
    expect(await findNotice('alert', 'That did not work. Try again.')).toBeInTheDocument()
  })

  it('never flashes the already-cooked message while leaving after Mark as Cooked', async () => {
    let plan = planView()
    mockApi({
      ...base(),
      'GET /api/plan': () => plan,
      'GET /api/plan/2026-11-10/2/1/cook': preview,
      'POST /api/plan/2026-11-10/2/1/cooked': () => {
        plan = planView({ state: 'cooked' })
        return cooked
      },
    })
    renderReheat()
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as Cooked' }))
    expect(await screen.findByText('Home page')).toBeInTheDocument()
    expect(screen.queryByText('This Planned Meal has already been cooked or skipped')).not.toBeInTheDocument()
  })
})
