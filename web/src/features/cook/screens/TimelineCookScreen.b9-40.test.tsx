// B9-40 (PC-12, PC-16 item 4, A11Y-01, DS 3, SHORT 3) on the slot's cooking timeline: the last Step of a meal that is not due yet, the title with the day,
// the labelled start time, the info Advance Steps, tap zones on a phone.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../../plan/test-utils'
import { sideOnly, timelineView } from '../timeline-fixtures'
import type { TimelineView } from '../types'
import { CookScreen } from './CookScreen'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))

// The household's today is Mon 9 Nov 2026. timelineView() is Dinner on Tue 10 (tomorrow) unless a test moves it.
/** `desktop`: no matchMedia (jsdom), so the Course menu is a popover with menuitems; the default is a phone, where it is a sheet. */
function setup(o: { view?: TimelineView; today?: string; date?: string; desktop?: boolean } = {}) {
  const date = o.date ?? '2026-11-10'
  const view = { ...(o.view ?? timelineView()), date }
  vi.stubGlobal('matchMedia', o.desktop ? undefined : (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} }))
  const api = mockApi({
    [`GET /api/cook/meals/${date}/4/all`]: view,
    'GET /api/cook/timers': { now: new Date().toISOString(), timers: [] },
    'GET /api/courses': { courses: [{ id: 1, name: 'Main', position: 0, main: true, archived: false }, { id: 2, name: 'Side', position: 1, main: false, archived: false }] },
    'GET /api/plan': { today: o.today ?? '2026-11-09', horizonDays: 7, updating: false, slots: [] },
  })
  renderWithProviders(
    <Routes>
      <Route path="/cook/meal/:date/:slotId" element={<CookScreen />} />
      <Route path="/plan" element={<p>Plan page</p>} />
      <Route path="/" element={<p>Home page</p>} />
    </Routes>,
    `/cook/meal/${date}/4`,
  )
  return api
}

async function toLastStep(total: number) {
  await screen.findByRole('article', { name: `Step 1 of ${total}` })
  for (let n = 1; n < total; n++) await userEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByRole('article', { name: `Step ${total} of ${total}` })
}

beforeEach(() => {
  window.localStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Scenario: The last Step of tomorrow\'s meal tells me when I can mark it Cooked (PC-12)', () => {
  it('Next is replaced by a primary "Back to Plan" and the held line says when; no disabled Next, no Mark all Cooked', async () => {
    setup()
    await toLastStep(4)
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark all Cooked' })).not.toBeInTheDocument()
    const leave = screen.getByRole('button', { name: 'Back to Plan' })
    expect(leave).toHaveAttribute('data-variant', 'primary')
    expect(leave).toHaveAccessibleDescription('This meal is for tomorrow. Mark it Cooked from Tue 10, on Today or the Plan.')
    const line = screen.getByText('This meal is for tomorrow. Mark it Cooked from Tue 10, on Today or the Plan.')
    expect(line).toHaveAttribute('role', 'status')
  })

  it('Back to Plan leaves for the Plan', async () => {
    setup()
    await toLastStep(4)
    await userEvent.click(screen.getByRole('button', { name: 'Back to Plan' }))
    expect(await screen.findByText('Plan page')).toBeInTheDocument()
  })

  it('a later date names the day: "This meal is for Thu 12. …"', async () => {
    setup({ date: '2026-11-12' })
    await toLastStep(4)
    expect(screen.getByText('This meal is for Thu 12. Mark it Cooked from Thu 12, on Today or the Plan.')).toBeInTheDocument()
  })

  it('one Course left: the same last Step', async () => {
    setup({ view: sideOnly() })
    await toLastStep(2)
    expect(screen.getByRole('button', { name: 'Back to Plan' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as Cooked' })).not.toBeInTheDocument()
  })

  it('before the last Step Next is a normal Next with no line', async () => {
    setup()
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
    expect(screen.queryByText(/This meal is for/)).not.toBeInTheDocument()
  })

  it('today\'s meal is as before: Mark all Cooked on the last Step, no Back to Plan, no line', async () => {
    setup({ today: '2026-11-10' })
    await toLastStep(4)
    expect(screen.getByRole('button', { name: 'Mark all Cooked' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back to Plan' })).not.toBeInTheDocument()
    expect(screen.queryByText(/This meal is for/)).not.toBeInTheDocument()
  })

  it('the title names the day: "Tue 10 Dinner"; today\'s keeps "Dinner"', async () => {
    setup()
    expect(await screen.findByRole('heading', { level: 1, name: 'Tue 10 Dinner' })).toBeInTheDocument()
  })

  it('today\'s title is "Dinner"', async () => {
    setup({ today: '2026-11-10' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Dinner' })).toBeInTheDocument()
  })

  it('the Course menu has no "Mark <Course> as Cooked" for a future date, and keeps "Not cooked"', async () => {
    setup({ desktop: true })
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    await userEvent.click(screen.getByRole('button', { name: 'Course actions' }))
    const items = screen.getAllByRole('menuitem').map((m) => m.textContent)
    expect(items).toEqual(['Not cooked: Main', 'Not cooked: Side'])
  })

  it('today\'s Course menu keeps all four entries', async () => {
    setup({ today: '2026-11-10', desktop: true })
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    await userEvent.click(screen.getByRole('button', { name: 'Course actions' }))
    expect(screen.getAllByRole('menuitem')).toHaveLength(4)
  })
})

describe('Cook title and the Step tile on the timeline (A11Y-01, PC-16 item 4)', () => {
  it('the document title is "Cook Mode · <header> · Feeder"', async () => {
    setup()
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    await waitFor(() => expect(document.title).toBe('Cook Mode · Tue 10 Dinner · Feeder'))
  })
  it('the planned time is the meta line "Start at 18:30" with its icon, and the count leads the overline', async () => {
    setup()
    const tile = await screen.findByRole('article', { name: 'Step 1 of 4' })
    expect(within(tile).getByText('Start at 18:30')).toBeInTheDocument()
    expect(tile.querySelector('.cook-step__clock svg')).toHaveAttribute('aria-hidden', 'true')
    expect(within(tile).getByRole('status')).toHaveTextContent('Step 1 of 4 · Active · 10 min')
  })
  it('a phone has tap zones here too', async () => {
    setup()
    const tile = await screen.findByRole('article', { name: 'Step 1 of 4' })
    expect(tile.querySelectorAll('[data-zone]')).toHaveLength(2)
  })
})

describe('Advance Steps on the timeline (DS 3)', () => {
  const adv = { courseId: 1, scope: 'meal:2026-11-10/4/1', step: 3, text: 'Marinate the chicken', leadTimeMinutes: 240, done: false, doneAt: null, warning: true }
  it('the tile is info', async () => {
    setup({ view: timelineView({ advance: [adv] }) })
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    expect(document.querySelector('.cook-advance')).toHaveAttribute('data-status', 'info')
  })
})
