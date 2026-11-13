// BR-H: Cook Mode of a Recipe that calls for a Base recipe, end to end through the (stubbed) API, with the JSON BR-G sends.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../../plan/test-utils'
import { BECHAMEL, baseAdvance, baseCookView, baseTimeline, coveredCookView, coveredTimeline, nestedTimeline } from '../base-fixtures'
import { MAIN_SCOPE, timer } from '../timeline-fixtures'
import type { CookTimer, CookView, TimelineView } from '../types'
import { CookScreen } from './CookScreen'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))

const courses = { courses: [{ id: 1, name: 'Main', position: 0, main: true, archived: false }] }
const plan = { today: '2026-11-10', horizonDays: 3, updating: false, slots: [] }

// The timer the server would make for the posted body (scope and step), labelled as BR-G labels the Step.
const LABELS: Record<number, string> = { 1: 'Béchamel: Simmer the sauce', 3: 'Step 4: Bake' }
function postedTimer(body: unknown) {
  const { scope, step } = body as { scope: string; step: number }
  return timer({ scope, step, label: LABELS[step] ?? `Step ${step + 1}` })
}

function setupMeal(view: TimelineView, timers: CookTimer[] = []) {
  const api = mockApi({
    'GET /api/cook/meals/2026-11-10/4/all': view,
    'GET /api/cook/timers': () => ({ now: new Date().toISOString(), timers }),
    'POST /api/cook/timers': (c) => postedTimer(c.body),
    'PUT /api/cook/marks': {},
    'GET /api/courses': courses,
    'GET /api/plan': plan,
  })
  renderWithProviders(
    <Routes>
      <Route path="/cook/meal/:date/:slotId" element={<CookScreen />} />
      <Route path="/" element={<p>Home page</p>} />
    </Routes>,
    '/cook/meal/2026-11-10/4',
  )
  return api
}

function setupRecipe(view: CookView, timers: CookTimer[] = []) {
  const api = mockApi({
    'GET /api/cook/recipes/7?batches=1': view,
    'GET /api/cook/timers': () => ({ now: new Date().toISOString(), timers }),
    'POST /api/cook/timers': (c) => postedTimer(c.body),
    'PUT /api/cook/marks': {},
    'GET /api/courses': courses,
    'GET /api/plan': plan,
  })
  renderWithProviders(
    <Routes>
      <Route path="/cook/recipe/:id" element={<CookScreen />} />
      <Route path="/" element={<p>Home page</p>} />
    </Routes>,
    '/cook/recipe/7?batches=1',
  )
  return api
}

const next = () => userEvent.click(screen.getByRole('button', { name: 'Next' }))

beforeEach(() => {
  vi.stubGlobal('matchMedia', undefined)
})

describe('CookScreen timeline: Base recipe chips', () => {
  it('a Step from a Base recipe has its chip; the Recipe\'s own Step has none', async () => {
    setupMeal(baseTimeline())
    const first = await screen.findByRole('article', { name: 'Step 1 of 4' })
    expect(within(first).getByRole('img', { name: 'Béchamel, Base recipe' })).toBeInTheDocument()
    await next()
    await next()
    const layer = await screen.findByRole('article', { name: 'Step 3 of 4' })
    expect(within(layer).getByText('Layer the lasagne')).toBeInTheDocument()
    expect(layer.querySelector('.chip')).toBeNull()
  })

  it('a nested Base recipe is named by its path', async () => {
    setupMeal(nestedTimeline())
    const first = await screen.findByRole('article', { name: 'Step 1 of 4' })
    expect(within(first).getByRole('img', { name: 'Béchamel · Roux, Base recipe' })).toHaveTextContent('Béchamel · Roux')
  })
})

describe('CookScreen timeline: "Béchamel ready"', () => {
  it('shows on the Step after the block only', async () => {
    setupMeal(baseTimeline())
    expect(within(await screen.findByRole('article', { name: 'Step 1 of 4' })).queryByText('Béchamel ready')).not.toBeInTheDocument()
    await next()
    expect(within(await screen.findByRole('article', { name: 'Step 2 of 4' })).queryByText('Béchamel ready')).not.toBeInTheDocument()
    await next()
    expect(within(await screen.findByRole('article', { name: 'Step 3 of 4' })).getByText('Béchamel ready')).toBeInTheDocument()
    await next()
    expect(within(await screen.findByRole('article', { name: 'Step 4 of 4' })).queryByText('Béchamel ready')).not.toBeInTheDocument()
  })

  it('is not shown when the Pantry covers the Base recipe (there is no block)', async () => {
    setupMeal(coveredTimeline())
    await screen.findByRole('article', { name: 'Step 1 of 2' })
    expect(screen.queryByText('Béchamel ready')).not.toBeInTheDocument()
  })
})

describe('CookScreen timeline: covered Base recipes', () => {
  it('names what the Pantry covers as a line, not as a Step; the Step numbers count what is shown', async () => {
    setupMeal(coveredTimeline())
    const tile = await screen.findByRole('article', { name: 'Step 1 of 2' })
    expect(within(tile).getByText('Layer the lasagne')).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Already in Stock' })
    expect(within(list).getByText('Béchamel from Stock')).toBeInTheDocument()
    expect(screen.queryByText('Melt the butter')).not.toBeInTheDocument()
    expect(screen.queryByRole('article', { name: /Step \d+ of 4/ })).not.toBeInTheDocument()
  })

  it('shows no line when nothing is covered', async () => {
    setupMeal(baseTimeline())
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    expect(screen.queryByRole('list', { name: 'Already in Stock' })).not.toBeInTheDocument()
    expect(screen.queryByText(/from Stock/)).not.toBeInTheDocument()
  })

  it('keeps the line while walking the Steps', async () => {
    setupMeal(coveredTimeline())
    await screen.findByRole('article', { name: 'Step 1 of 2' })
    await next()
    await screen.findByRole('article', { name: 'Step 2 of 2' })
    expect(screen.getByText('Béchamel from Stock')).toBeInTheDocument()
  })

  it('a Step with a composed index keeps it for the marks and timers (the Bake timer is Step 3)', async () => {
    const api = setupMeal(coveredTimeline())
    await screen.findByRole('article', { name: 'Step 1 of 2' })
    await next()
    await waitFor(() => expect(api.callsTo('POST', '/api/cook/timers')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/cook/timers')[0]!.body).toEqual({ scope: MAIN_SCOPE, step: 3 })
  })
})

describe('CookScreen timeline: Advance list and timers', () => {
  it('the Advance list shows the Base recipe chip of an Advance Step', async () => {
    setupMeal(baseTimeline({ advance: baseAdvance() }))
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    const row = screen.getByText('Chill the milk · 4 h ahead').closest('li')!
    expect(within(row).getByRole('img', { name: 'Béchamel, Base recipe' })).toBeInTheDocument()
    expect(screen.getByText('Buy fresh pasta · 1 h ahead').closest('li')!.querySelector('.chip')).toBeNull()
  })

  it('a running timer on a Base recipe Step shows the label the server gave it', async () => {
    const running = timer({ scope: MAIN_SCOPE, step: 1, label: 'Béchamel: Simmer the sauce', recipeName: 'Lasagne' })
    const api = setupMeal(baseTimeline(), [running])
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    await next()
    await screen.findByRole('article', { name: 'Step 2 of 4' })
    expect(await screen.findByRole('timer', { name: 'Béchamel: Simmer the sauce' })).toBeInTheDocument()
    await waitFor(() => expect(api.callsTo('POST', '/api/cook/timers')[0]?.body).toEqual({ scope: MAIN_SCOPE, step: 1 }))
  })
})

describe('CookScreen Course view (Recipe route): Base recipes', () => {
  it('chips, "ready" and the Advance chip, as in the timeline', async () => {
    setupRecipe(baseCookView({ advance: [{ step: 4, text: 'Chill the milk', leadTimeMinutes: 240, done: false, doneAt: null, warning: true, baseRecipe: BECHAMEL }] }))
    const first = await screen.findByRole('article', { name: 'Step 1 of 4' })
    expect(within(first).getByRole('img', { name: 'Béchamel, Base recipe' })).toBeInTheDocument()
    expect(within(screen.getByText('Chill the milk · 4 h ahead').closest('li')!).getByRole('img', { name: 'Béchamel, Base recipe' })).toBeInTheDocument()
    await next()
    expect(within(await screen.findByRole('article', { name: 'Step 2 of 4' })).queryByText('Béchamel ready')).not.toBeInTheDocument()
    await next()
    const layer = await screen.findByRole('article', { name: 'Step 3 of 4' })
    expect(within(layer).getByText('Béchamel ready')).toBeInTheDocument()
    expect(layer.querySelector('.chip')).toBeNull()
  })

  it('covered Base recipes are lines, not Steps', async () => {
    setupRecipe(coveredCookView())
    await screen.findByRole('article', { name: 'Step 1 of 2' })
    expect(within(screen.getByRole('list', { name: 'Already in Stock' })).getByText('Béchamel from Stock')).toBeInTheDocument()
    expect(screen.queryByText('Melt the butter')).not.toBeInTheDocument()
  })

  it('the timer of a Base recipe Step is started under the composed index and shown under its label', async () => {
    const running = timer({ scope: 'recipe:7', step: 1, label: 'Béchamel: Simmer the sauce', recipeName: 'Lasagne' })
    const api = setupRecipe(baseCookView(), [running])
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    await next()
    await waitFor(() => expect(api.callsTo('POST', '/api/cook/timers')[0]?.body).toEqual({ scope: 'recipe:7', step: 1 }))
    expect(await screen.findByRole('timer', { name: 'Béchamel: Simmer the sauce' })).toBeInTheDocument()
  })
})
