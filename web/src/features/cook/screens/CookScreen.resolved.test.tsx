// CRS F review (spec 11): a chip whose Course has resolved falls back to All; Mark all Cooked shows its outcome.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { courseMeal, mockApi, renderWithProviders } from '../../plan/test-utils'
import type { CookPreview } from '../../plan/types'
import { timelineView, timer } from '../timeline-fixtures'
import type { TimelineView } from '../types'
import { CookScreen } from './CookScreen'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))

const courses = {
  courses: [
    { id: 1, name: 'Main', position: 0, main: true, archived: false },
    { id: 2, name: 'Side', position: 1, main: false, archived: false },
  ],
}
const plan = { today: '2026-11-10', horizonDays: 3, updating: false, slots: [] }
const preview = (courseId: number, courseName: string, recipeName: string): CookPreview => ({
  meal: courseMeal(courseId, courseName, { recipeName, mealSlotId: 4 }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 2, maxLeftover: 4,
  leftoverUseBy: '2026-11-13', needs: [],
})
const previews = {
  'GET /api/plan/2026-11-10/4/1/cook': preview(1, 'Main', 'Roast chicken'),
  'GET /api/plan/2026-11-10/4/2/cook': preview(2, 'Side', 'Green beans'),
}

/** The slot after the Side is Cooked: the Main's two items remain. */
function mainOnly(): TimelineView {
  const v = timelineView()
  return { ...v, courses: [v.courses[0]!, { ...v.courses[1]!, state: 'cooked' }], items: v.items.filter((i) => i.courseId === 1).map((i, n) => ({ ...i, number: n + 1 })) }
}

function setup(o: { view?: TimelineView; later?: unknown; route?: string; extra?: Record<string, unknown> } = {}) {
  let calls = 0
  const api = mockApi({
    'GET /api/cook/meals/2026-11-10/4/all': () => (++calls > 1 && o.later !== undefined ? o.later : (o.view ?? timelineView())),
    'GET /api/cook/timers': () => ({ now: new Date().toISOString(), timers: [] }),
    'POST /api/cook/timers': () => timer(),
    'GET /api/courses': courses,
    'GET /api/plan': plan,
    ...o.extra,
  })
  renderWithProviders(
    <Routes>
      <Route path="/cook/meal/:date/:slotId" element={<CookScreen />} />
      <Route path="/cook/meal/:date/:slotId/:courseId" element={<CookScreen />} />
      <Route path="/" element={<p>Home page</p>} />
    </Routes>,
    o.route ?? '/cook/meal/2026-11-10/4',
  )
  return api
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', undefined)
})

describe('a chosen Course chip whose Course resolves', () => {
  it('Mark Side as Cooked on the Side chip: the filter falls back to All with the Main\'s items, no empty list', async () => {
    const api = setup({
      later: mainOnly(),
      extra: { ...previews, 'POST /api/plan/2026-11-10/4/2/cooked': { meal: courseMeal(2, 'Side', { state: 'cooked' }), leftover: null, warnings: [], plannedFor: [] } },
    })
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    await userEvent.click(screen.getByRole('button', { name: 'Side' }))
    await screen.findByRole('article', { name: 'Step 1 of 2' })
    await userEvent.click(screen.getByRole('button', { name: 'Course actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mark Side as Cooked' }))
    const sheet = await screen.findByRole('dialog', { name: 'Mark as Cooked' })
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Mark as Cooked' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/4/2/cooked')).toHaveLength(1))
    const tile = await screen.findByRole('article', { name: 'Step 1 of 2' })
    expect(within(tile).getByText('Brown the chicken')).toBeInTheDocument()
    expect(screen.queryByText('No Steps to follow. Enjoy!')).not.toBeInTheDocument()
    // Not a chip on an empty list: nothing to mark yet (Step 1 of 2), and no Side chip is left to be pressed.
    expect(screen.queryByRole('button', { name: 'Mark as Cooked' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark all Cooked' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Side' })).not.toBeInTheDocument()
  })

  it('/cook/meal/<date>/<slot>/<course> for a Course that has already resolved opens on All with the other Courses\' items', async () => {
    setup({ view: mainOnly(), route: '/cook/meal/2026-11-10/4/2' })
    const tile = await screen.findByRole('article', { name: 'Step 1 of 2' })
    expect(within(tile).getByText('Brown the chicken')).toBeInTheDocument()
    expect(screen.queryByText('No Steps to follow. Enjoy!')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as Cooked' })).not.toBeInTheDocument()
  })

  it('the last item of the remaining Course then offers Mark as Cooked for it', async () => {
    setup({ view: mainOnly(), route: '/cook/meal/2026-11-10/4/2', extra: previews })
    await screen.findByRole('article', { name: 'Step 1 of 2' })
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByRole('button', { name: 'Mark as Cooked' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark all Cooked' })).not.toBeInTheDocument()
  })
})
