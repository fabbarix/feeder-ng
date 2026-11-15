// B9-40 (PC-15): Reheat has one main action at a time. The tile is overline, Recipe, meta, one stepper (− 4:00 +) and the tile's one primary; the
// footer's Mark as Cooked is secondary until the timer finishes. The same layout at every width (a column, 40 rem at most).
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { courseMeal, mockApi, planCourse, renderWithProviders } from '../../plan/test-utils'
import { serverSlot } from '../../plan/test-utils.c3'
import type { PlanView } from '../../plan/types'
import type { CookTimer } from '../types'
import { ReheatScreen } from './ReheatScreen'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))

const SCOPE = 'meal:2026-11-10/2/1'
const source = { leftoverId: 4, date: '2026-11-09', mealSlotId: 2, recipeName: 'Slow cooker beef and barley stew' }
const planView = (): PlanView => ({
  today: '2026-11-10', horizonDays: 7, updating: false,
  slots: [
    serverSlot([planCourse({ courseId: 1, main: true, name: 'Main', meal: courseMeal(1, 'Main', { recipeName: 'Slow cooker beef and barley stew', portions: 2.75, reheatMinutes: 4, servedFromLeftover: source }) })], {
      date: '2026-11-10', mealSlotId: 2, name: 'Dinner', time: '19:00',
    }),
  ],
})
const timers = (list: CookTimer[] = []) => ({ now: '2026-11-10T18:00:00Z', timers: list })
const running: CookTimer = { id: 5, scope: SCOPE, step: null, label: 'Reheat', durationSeconds: 240, state: 'running', remainingSeconds: 150, endsAt: '2026-11-10T18:02:30Z', startedAt: '2026-11-10T18:00:00Z' }

function renderReheat(list: CookTimer[] = []) {
  mockApi({ 'GET /api/plan': planView(), 'GET /api/cook/timers': timers(list) })
  return renderWithProviders(
    <Routes>
      <Route path="/cook/reheat/:date/:slotId/:courseId" element={<ReheatScreen />} />
    </Routes>,
    '/cook/reheat/2026-11-10/2/1',
  )
}

const primaries = () => screen.getAllByRole('button').filter((b) => b.getAttribute('data-variant') === 'primary')

beforeEach(() => {
  vi.stubGlobal('matchMedia', undefined)
})

describe('Reheat tile (PC-15)', () => {
  it('has the overline "Leftover from Mon Dinner", the Recipe name and the meta "2.75 portions · Tue Dinner 19:00"', async () => {
    const { container } = renderReheat()
    await screen.findByRole('heading', { name: 'Reheat' })
    const tile = container.querySelector('.reheat-tile')!
    expect(tile.querySelector('.tile__overline')).toHaveTextContent('Leftover from Mon Dinner')
    expect(within(tile as HTMLElement).getByText('Slow cooker beef and barley stew')).toBeInTheDocument()
    expect(tile).toHaveTextContent('2.75 portions · Tue Dinner 19:00')
  })

  it('has ONE stepper, a group named "Reheat time", with 56 px round − and + and the time between them', async () => {
    renderReheat()
    const group = await screen.findByRole('group', { name: 'Reheat time' })
    expect(group).toHaveAttribute('data-size', 'lg')
    expect(within(group).getByRole('button', { name: 'Remove 30 seconds' })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: 'Add 30 seconds' })).toBeInTheDocument()
    expect(within(group).getByText('4:00')).toBeInTheDocument()
    expect(screen.getAllByRole('group', { name: 'Reheat time' })).toHaveLength(1)
  })

  it('the stepper moves the time by 30 seconds', async () => {
    renderReheat()
    await userEvent.click(await screen.findByRole('button', { name: 'Add 30 seconds' }))
    expect(screen.getByText('4:30')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove 30 seconds' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove 30 seconds' }))
    expect(screen.getByText('3:30')).toBeInTheDocument()
  })

  it('Start timer is the tile\'s full-width button and Mark as Cooked the footer\'s, below the tile', async () => {
    const { container } = renderReheat()
    const start = await screen.findByRole('button', { name: 'Start timer' })
    const mark = screen.getByRole('button', { name: 'Mark as Cooked' })
    expect(container.querySelector('.reheat-tile')!.contains(start)).toBe(true)
    expect(container.querySelector('.reheat-tile')!.contains(mark)).toBe(false)
    expect(start).toHaveAttribute('data-block', 'always')
    expect(mark).toHaveAttribute('data-block', 'always')
    expect(start.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('Scenario: Reheat has one main action at a time', () => {
  it('before the timer starts: Start timer is the one primary, Mark as Cooked is secondary', async () => {
    renderReheat()
    await screen.findByRole('button', { name: 'Start timer' })
    expect(primaries().map((b) => b.textContent)).toEqual(['Start timer'])
    expect(screen.getByRole('button', { name: 'Mark as Cooked' })).toHaveAttribute('data-variant', 'secondary')
  })

  it('while it runs: Pause is the one primary; Cancel timer and Mark as Cooked are secondary', async () => {
    renderReheat([running])
    await screen.findByRole('button', { name: 'Pause' })
    expect(primaries().map((b) => b.textContent)).toEqual(['Pause'])
    expect(screen.getByRole('button', { name: 'Cancel timer' })).toHaveAttribute('data-variant', 'secondary')
    expect(screen.getByRole('button', { name: 'Mark as Cooked' })).toHaveAttribute('data-variant', 'secondary')
  })

  it('paused: Resume is the one primary', async () => {
    renderReheat([{ ...running, state: 'paused' }])
    await screen.findByRole('button', { name: 'Resume' })
    expect(primaries().map((b) => b.textContent)).toEqual(['Resume'])
  })

  it('when the timer finishes: Mark as Cooked becomes the one primary and Start timer becomes "Restart" (secondary)', async () => {
    renderReheat([{ ...running, state: 'finished', remainingSeconds: 0 }])
    await screen.findByText('Reheat is ready')
    expect(primaries().map((b) => b.textContent)).toEqual(['Mark as Cooked'])
    expect(screen.getByRole('button', { name: 'Restart' })).toHaveAttribute('data-variant', 'secondary')
    expect(screen.queryByRole('button', { name: 'Start timer' })).not.toBeInTheDocument()
  })

  it('with a timer there is no stepper: the time is a timer named "Reheat"', async () => {
    renderReheat([running])
    await screen.findByRole('button', { name: 'Pause' })
    expect(screen.queryByRole('group', { name: 'Reheat time' })).not.toBeInTheDocument()
    expect(screen.getByRole('timer', { name: 'Reheat' })).toHaveTextContent('2:30')
  })

  it('never more than one primary button, in any state', async () => {
    for (const list of [[], [running], [{ ...running, state: 'paused' as const }], [{ ...running, state: 'finished' as const, remainingSeconds: 0 }]]) {
      const view = renderReheat(list)
      await waitFor(() => expect(screen.getByRole('button', { name: 'Mark as Cooked' })).toBeInTheDocument())
      await waitFor(() => expect(primaries().length).toBe(1))
      view.unmount()
    }
  })
})
