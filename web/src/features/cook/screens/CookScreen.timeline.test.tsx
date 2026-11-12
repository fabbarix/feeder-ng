// CRS F (spec 11): Cook Mode on the slot's cooking timeline, end to end through the (stubbed) API.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { courseMeal, mockApi, renderWithProviders } from '../../plan/test-utils'
import type { CookPreview } from '../../plan/types'
import { MAIN_SCOPE, SIDE_SCOPE, sideOnly, timelineView, timer } from '../timeline-fixtures'
import type { CookTimer, TimelineView } from '../types'
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

interface Options {
  view?: TimelineView
  later?: TimelineView
  timers?: CookTimer[]
  route?: string
  extra?: Record<string, unknown>
}

function setup(o: Options = {}) {
  let current = o.view ?? timelineView()
  const timers = o.timers ?? []
  const api = mockApi({
    'GET /api/cook/meals/2026-11-10/4/all': () => {
      const out = current
      if (o.later) current = o.later
      return out
    },
    'GET /api/cook/timers': () => ({ now: new Date().toISOString(), timers }),
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

describe('CookScreen: the cooking timeline', () => {
  it('opens the timeline of the slot: "Step 1 of 4", the Course and Recipe in a caption, the planned clock time', async () => {
    const api = setup()
    const tile = await screen.findByRole('article', { name: 'Step 1 of 4' })
    expect(within(tile).getByText('Brown the chicken')).toBeInTheDocument()
    expect(within(tile).getByText('Main · Roast chicken')).toBeInTheDocument()
    expect(within(tile).getByText('18:30')).toBeInTheDocument()
    expect(screen.getAllByRole('status').map((e) => e.textContent)).toContain('Step 1 of 4')
    expect(screen.getByRole('heading', { level: 1, name: 'Dinner' })).toBeInTheDocument()
    expect(api.callsTo('GET', '/api/cook/meals/2026-11-10/4/all')).toHaveLength(1)
  })

  it('steps through the items in the order the server sent them, Courses interleaved', async () => {
    setup()
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(within(await screen.findByRole('article', { name: 'Step 2 of 4' })).getByText('Side · Green beans')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(within(await screen.findByRole('article', { name: 'Step 3 of 4' })).getByText('Roast in the oven')).toBeInTheDocument()
  })

  it('reaching a Passive Step starts its timer in that Course\'s scope', async () => {
    const api = setup()
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/cook/timers')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/cook/timers')[0]!.body).toEqual({ scope: SIDE_SCOPE, step: 0 })
  })

  it('shows the Advance Steps of every Course above the first item, grouped by Course', async () => {
    const advance = [
      { courseId: 1, scope: MAIN_SCOPE, step: 2, text: 'Marinate the chicken', leadTimeMinutes: 240, done: false, doneAt: null, warning: true },
      { courseId: 2, scope: SIDE_SCOPE, step: 2, text: 'Soak the beans', leadTimeMinutes: 480, done: false, doneAt: null, warning: true },
    ]
    const api = setup({ view: timelineView({ advance }), extra: { 'PUT /api/cook/marks': {} } })
    const side = await screen.findByRole('group', { name: 'Side' })
    expect(within(side).getByText('Soak the beans · 8 h ahead')).toBeInTheDocument()
    await userEvent.click(within(side).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/cook/marks')).toHaveLength(1))
    expect(api.callsTo('PUT', '/api/cook/marks')[0]!.body).toEqual({ scope: SIDE_SCOPE, step: 2, done: true })
  })
})

describe('CookScreen: All / Course filter chips', () => {
  it('has All · Main · Side; a Course chip shows only that Course with its own position', async () => {
    setup()
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    const chips = screen.getByRole('group', { name: 'Courses' })
    expect(within(chips).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(chips).getByRole('button', { name: 'Side' }))
    const tile = await screen.findByRole('article', { name: 'Step 1 of 2' })
    expect(within(tile).getByText('Simmer the beans')).toBeInTheDocument()
    expect(within(chips).getByRole('button', { name: 'Side' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps each chip\'s position when you come back to it', async () => {
    setup()
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('article', { name: 'Step 3 of 4' })
    await userEvent.click(screen.getByRole('button', { name: 'Side' }))
    await screen.findByRole('article', { name: 'Step 1 of 2' })
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(await screen.findByRole('article', { name: 'Step 3 of 4' })).toBeInTheDocument()
  })

  it('every timer of the slot stays on screen whichever chip is chosen', async () => {
    setup({ timers: [timer({ id: 1, scope: MAIN_SCOPE, step: 1, label: 'Roast chicken · Roast in the oven' }), timer({ id: 2, scope: SIDE_SCOPE, step: 0 })] })
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    const region = await screen.findByRole('region', { name: 'Timers' })
    expect(within(region).getAllByRole('timer')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Side' }))
    await screen.findByRole('article', { name: 'Step 1 of 2' })
    expect(within(screen.getByRole('region', { name: 'Timers' })).getAllByRole('timer')).toHaveLength(2)
    expect(screen.queryByRole('region', { name: 'Other timers' })).not.toBeInTheDocument()
  })

  it('/cook/meal/<date>/<slot>/<course> opens on that Course\'s chip', async () => {
    setup({ route: '/cook/meal/2026-11-10/4/2' })
    expect(await screen.findByRole('article', { name: 'Step 1 of 2' })).toHaveTextContent('Simmer the beans')
    expect(screen.getByRole('button', { name: 'Side' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('CookScreen: Next waits only for the next item\'s own Course', () => {
  it('holds Next while the NEXT item\'s Course has a timer for a Step it waits for', async () => {
    // at item 3 (Main: roast) the next item is Side step 1, which waits for Side step 0 (its simmer timer)
    setup({ timers: [timer({ id: 2, scope: SIDE_SCOPE, step: 0 })] })
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('article', { name: 'Step 3 of 4' })
    const next = screen.getByRole('button', { name: 'Next' })
    await waitFor(() => expect(next).toBeDisabled())
    expect(screen.getByText(/Next waits for Green beans · Simmer the beans: 4:\d\d left/)).toBeInTheDocument()
  })

  it('another Course\'s timer does not hold: a Step never waits for a Step of another Course', async () => {
    // at item 2 (Side: simmer) the next item is Main step 1 (waits for Main step 0); only the Side's simmer timer runs
    setup({ timers: [timer({ id: 2, scope: SIDE_SCOPE, step: 0 })] })
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('article', { name: 'Step 2 of 4' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
    expect(screen.queryByText(/Next waits for/)).not.toBeInTheDocument()
  })
})

describe('CookScreen: Mark all Cooked and the Course menu', () => {
  const routes = {
    'GET /api/plan/2026-11-10/4/1/cook': preview(1, 'Main', 'Roast chicken'),
    'GET /api/plan/2026-11-10/4/2/cook': preview(2, 'Side', 'Green beans'),
  }

  it('the last item offers Mark all Cooked, which confirms every Course together', async () => {
    const api = setup({ extra: { ...routes, 'POST /api/plan/2026-11-10/4/all/cooked': { meals: [], leftovers: [], warnings: [], plannedFor: [] } } })
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    for (let i = 0; i < 3; i++) await userEvent.click(await screen.findByRole('button', { name: 'Next' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Mark all Cooked' }))
    const sheet = await screen.findByRole('dialog', { name: 'Mark all Cooked' })
    await within(sheet).findByRole('spinbutton', { name: 'Main Leftover portions' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Mark all Cooked' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/4/all/cooked')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/plan/2026-11-10/4/all/cooked')[0]!.body).toEqual({
      courses: [{ courseId: 1, leftoverPortions: 2 }, { courseId: 2, leftoverPortions: 2 }],
    })
  })

  it('"Mark Side as Cooked" from the Course menu cooks the Side only, and its items leave the timeline', async () => {
    const api = setup({
      later: sideOnlyMain(),
      extra: { ...routes, 'POST /api/plan/2026-11-10/4/2/cooked': { meal: courseMeal(2, 'Side', { state: 'cooked' }), leftover: null, warnings: [], plannedFor: [] } },
    })
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    await userEvent.click(screen.getByRole('button', { name: 'Course actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mark Side as Cooked' }))
    const sheet = await screen.findByRole('dialog', { name: 'Mark as Cooked' })
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Mark as Cooked' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/4/2/cooked')).toHaveLength(1))
    expect(await screen.findByRole('article', { name: 'Step 1 of 1' })).toHaveTextContent('Brown the chicken')
    expect(screen.queryByRole('group', { name: 'Courses' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Course actions' })).not.toBeInTheDocument()
  })

  it('"Not cooked: Side" skips the Side straight away', async () => {
    const api = setup({ later: sideOnlyMain(), extra: { 'POST /api/plan/2026-11-10/4/2/not-cooked': courseMeal(2, 'Side', { state: 'skipped' }) } })
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    await userEvent.click(screen.getByRole('button', { name: 'Course actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Not cooked: Side' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/4/2/not-cooked')).toHaveLength(1))
    expect(await screen.findByRole('article', { name: 'Step 1 of 1' })).toBeInTheDocument()
  })
})

/** The slot after the Side is Cooked: only the Main's two items remain. */
function sideOnlyMain(): TimelineView {
  const v = timelineView()
  return {
    ...v,
    courses: [v.courses[0]!, { ...v.courses[1]!, state: 'cooked' }],
    items: v.items.filter((i) => i.courseId === 1).map((i, n) => ({ ...i, number: n + 1, after: [] })).slice(0, 1),
  }
}

describe('CookScreen with ONE Course (regression guards: nothing changes)', () => {
  const routes = { 'GET /api/plan/2026-11-10/4/2/cook': preview(2, 'Side', 'Green beans') }

  it('shows the Recipe as the title, "Step 1 of 2", no chips, no caption, no Course menu', async () => {
    setup({ view: sideOnly() })
    expect(await screen.findByRole('heading', { level: 1, name: 'Green beans' })).toBeInTheDocument()
    const tile = await screen.findByRole('article', { name: 'Step 1 of 2' })
    // No Course caption on a one-Course timeline ("Side · Green beans"); the Step's own overline ("Passive · 10 min timer") may still have a "·".
    expect(within(tile).queryByText(/^(Main|Side)\b/)).not.toBeInTheDocument()
    expect(within(tile).queryByText('Side · Green beans')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Courses' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Course actions' })).not.toBeInTheDocument()
  })

  it('the last Step offers Mark as Cooked (not Mark all Cooked) for that Course', async () => {
    const api = setup({
      view: sideOnly(),
      extra: { ...routes, 'POST /api/plan/2026-11-10/4/2/cooked': { meal: courseMeal(2, 'Side', { state: 'cooked' }), leftover: null, warnings: [], plannedFor: [] } },
    })
    await screen.findByRole('article', { name: 'Step 1 of 2' })
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.queryByRole('button', { name: 'Mark all Cooked' })).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as Cooked' }))
    const sheet = await screen.findByRole('dialog', { name: 'Mark as Cooked' })
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Mark as Cooked' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/4/2/cooked')).toHaveLength(1))
  })

  it('the Next gate is the old one: a timer of the same Course for a Step it waits for holds Next', async () => {
    setup({ view: sideOnly(), timers: [timer({ id: 2, scope: SIDE_SCOPE, step: 0 })] })
    await screen.findByRole('article', { name: 'Step 1 of 2' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled())
    expect(screen.getByText(/Next waits for Green beans · Simmer the beans/)).toBeInTheDocument()
  })
})
