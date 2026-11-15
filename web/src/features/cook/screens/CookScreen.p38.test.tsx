// B9-40 review (P38, A11Y-08): in Cook Mode every visible button has its own name, also with three timers (two of them sharing a title)
// over several Courses and two pending Advance Steps: "Pause <timer>", "Options for <timer>", the pill's "Timer: <timer>, … Show options",
// and each Advance Step's "Done: <text>".
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../../plan/test-utils'
import { MAIN_SCOPE, SIDE_SCOPE, timelineView, timer } from '../timeline-fixtures'
import { CookScreen } from './CookScreen'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))

const advance = (courseId: number, scope: string, step: number, text: string) => ({
  courseId, scope, step, text, leadTimeMinutes: 240, done: false, doneAt: null, warning: true, baseRecipe: null,
})

function setup(desktop: boolean) {
  const date = '2026-11-10'
  const view = timelineView({
    advance: [advance(1, MAIN_SCOPE, 5, 'Marinate the chicken'), advance(2, SIDE_SCOPE, 5, 'Soak the beans')],
  })
  vi.stubGlobal('matchMedia', desktop ? undefined : (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} }))
  mockApi({
    [`GET /api/cook/meals/${date}/4/all`]: view,
    'GET /api/cook/timers': {
      now: new Date().toISOString(),
      timers: [
        timer({ id: 41 }),
        // the same title in both Courses: Step 1 of each Recipe
        timer({ id: 42, scope: MAIN_SCOPE, step: 0, recipeName: 'Roast chicken', label: 'Step 1: Pre-heat the oven', remainingSeconds: 400 }),
        timer({ id: 43, scope: SIDE_SCOPE, step: 2, recipeName: 'Green beans', label: 'Step 3: Pre-heat the oven', state: 'paused', remainingSeconds: 90, endsAt: null }),
      ],
    },
    'GET /api/courses': { courses: [{ id: 1, name: 'Main', position: 0, main: true, archived: false }, { id: 2, name: 'Side', position: 1, main: false, archived: false }] },
    'GET /api/plan': { today: '2026-11-09', horizonDays: 7, updating: false, slots: [] },
  })
  renderWithProviders(
    <Routes>
      <Route path="/cook/meal/:date/:slotId" element={<CookScreen />} />
    </Routes>,
    `/cook/meal/${date}/4`,
  )
}

function duplicateButtonNames(): string[] {
  // every button here is named by aria-label or by its text (aria-labelledby is not used in Cook Mode)
  const names = screen.getAllByRole('button').map((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim())
  return names.filter((n, i) => names.indexOf(n) !== i)
}

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('P38: Cook Mode with three timers and several Courses has no two buttons of one name', () => {
  it('on a phone (the strip of pills)', async () => {
    setup(false)
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    await screen.findByRole('button', { name: 'Pause Pre-heat the oven · Step 1' })
    expect(screen.getByRole('button', { name: 'Resume Pre-heat the oven · Step 3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Timer: Pre-heat the oven · Step 1, .*\. Show options$/ })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Done: / })).toHaveLength(2)
    expect(duplicateButtonNames()).toEqual([])
  })

  it('from 1024 px (the rail of timer tiles)', async () => {
    setup(true)
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    await screen.findByRole('button', { name: 'Options for Pre-heat the oven · Step 1' })
    expect(screen.getByRole('button', { name: 'Options for Pre-heat the oven · Step 3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Options for Green beans · Simmer the beans' })).toBeInTheDocument()
    expect(duplicateButtonNames()).toEqual([])
  })
})
