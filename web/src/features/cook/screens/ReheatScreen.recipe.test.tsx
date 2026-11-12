import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isIcon } from '../../../test/iconPaths'
import { courseMeal, meal, mockApi, planCourse, renderWithProviders } from '../../plan/test-utils'
import { serverSlot } from '../../plan/test-utils.c3'
import type { PlanView } from '../../plan/types'
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
const started: CookTimer = {
  id: 5, scope: SCOPE, step: null, label: 'Reheat', durationSeconds: 300, state: 'running', remainingSeconds: 300,
  endsAt: '2026-11-10T18:05:00Z', startedAt: '2026-11-10T18:00:00Z',
}

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

describe('ReheatScreen with the Recipe reheat time (R12)', () => {
  it('starts at the Recipe time when the Planned Meal carries one (2 portions would be 3:00)', async () => {
    mockApi({ 'GET /api/plan': planView({ reheatMinutes: 5 }), 'GET /api/cook/timers': timers() })
    renderReheat()
    expect(await screen.findByText('5:00')).toBeInTheDocument()
    expect(screen.queryByText('3:00')).not.toBeInTheDocument()
  })

  it('falls back to the formula when the Recipe has none', async () => {
    mockApi({ 'GET /api/plan': planView(), 'GET /api/cook/timers': timers() })
    renderReheat()
    expect(await screen.findByText('3:00')).toBeInTheDocument()
  })

  it('adjusts the Recipe time by 30 seconds and starts the timer with it', async () => {
    const api = mockApi({ 'GET /api/plan': planView({ reheatMinutes: 5 }), 'GET /api/cook/timers': timers(), 'POST /api/cook/timers': { status: 201, json: started } })
    renderReheat()
    await userEvent.click(await screen.findByRole('button', { name: 'Add 30 seconds' }))
    expect(screen.getByText('5:30')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Start timer' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/cook/timers')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/cook/timers')[0]!.body).toEqual({ scope: SCOPE, label: 'Reheat', durationSeconds: 330 })
  })

  it('a Recipe time of 15 minutes is not capped at the formula limit of 10', async () => {
    mockApi({ 'GET /api/plan': planView({ reheatMinutes: 15 }), 'GET /api/cook/timers': timers() })
    renderReheat()
    expect(await screen.findByText('15:00')).toBeInTheDocument()
  })
})

describe('ReheatScreen icon (R12)', () => {
  it('the Reheat tile shows the dedicated reheat icon, not the timer one', async () => {
    mockApi({ 'GET /api/plan': planView(), 'GET /api/cook/timers': timers() })
    const { container } = renderReheat()
    await screen.findByRole('heading', { name: 'Chicken curry' })
    const svg = container.querySelector('.reheat-tile .tile__overline svg')
    expect(svg).not.toBeNull()
    expect(isIcon(svg, 'reheat')).toBe(true)
    expect(isIcon(svg, 'timer')).toBe(false)
  })
})
