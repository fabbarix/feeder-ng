// b5-ufw round 2: Mark as Cooked reached from Cook Mode offers Used from, as the Plan path does.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CookPreviewWithLots } from '../../plan/api.usedFrom'
import { allCookedResult, courseMeal, mockApi, renderWithProviders } from '../../plan/test-utils'
import { timelineView, timer } from '../timeline-fixtures'
import { CookScreen } from './CookScreen'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))

const lot = (id: number, quantity: number, place: string) => ({ id, quantity, purchased: '2026-11-09', goesOff: '2026-11-14', storagePlaceName: place })
const preview = (courseId: number, courseName: string, recipeName: string, ingredientId: number, ingredient: string): CookPreviewWithLots => ({
  meal: courseMeal(courseId, courseName, { recipeName, mealSlotId: 4 }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 2, maxLeftover: 4,
  leftoverUseBy: '2026-11-13',
  needs: [{ ingredientId, ingredient, quantity: 400, baseUnit: 'g', lots: [lot(ingredientId * 10, 500, 'Fridge'), lot(ingredientId * 10 + 1, 600, 'Freezer')] }],
})
const routes = {
  'GET /api/plan/2026-11-10/4/1/cook': preview(1, 'Main', 'Roast chicken', 11, 'Chicken thighs'),
  'GET /api/plan/2026-11-10/4/2/cook': preview(2, 'Side', 'Green beans', 12, 'Green beans'),
  'GET /api/cook/timers': { now: new Date().toISOString(), timers: [] },
  'POST /api/cook/timers': () => timer(),
  'GET /api/courses': { courses: [{ id: 1, name: 'Main', position: 0, main: true, archived: false }, { id: 2, name: 'Side', position: 1, main: false, archived: false }] },
  'GET /api/plan': { today: '2026-11-10', horizonDays: 3, updating: false, slots: [] },
  'GET /api/cook/meals/2026-11-10/4/all': () => timelineView(),
}

function setup(extra: Record<string, unknown> = {}) {
  const api = mockApi({ ...routes, ...extra })
  renderWithProviders(
    <Routes>
      <Route path="/cook/meal/:date/:slotId" element={<CookScreen />} />
      <Route path="/" element={<p>Home page</p>} />
    </Routes>,
    '/cook/meal/2026-11-10/4',
  )
  return api
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', undefined)
})

describe('Cook Mode: Mark as Cooked offers Used from', () => {
  async function openSideSheet() {
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    await userEvent.click(screen.getByRole('button', { name: 'Course actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mark Side as Cooked' }))
    const sheet = await screen.findByRole('dialog', { name: 'Mark as Cooked' })
    await within(sheet).findByRole('spinbutton', { name: 'Leftover portions' })
    return sheet
  }

  it('the Mark as Cooked sheet shows a Used from row with the default summary', async () => {
    setup()
    const sheet = await openSideSheet()
    expect(await within(sheet).findByRole('button', { name: /Used from/ })).toHaveAttribute('aria-expanded', 'false')
    expect(within(sheet).getByText('Soonest to go off first')).toBeInTheDocument()
  })

  it('a Lot ticked there is sent as usedFrom when the Course is marked Cooked', async () => {
    const api = setup({ 'POST /api/plan/2026-11-10/4/2/cooked': { meal: courseMeal(2, 'Side', { state: 'cooked' }), leftover: null, warnings: [], plannedFor: [] } })
    const sheet = await openSideSheet()
    await userEvent.click(await within(sheet).findByRole('button', { name: /Used from/ }))
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /500 g · Fridge/ }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Mark as Cooked' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/4/2/cooked')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/plan/2026-11-10/4/2/cooked')[0]!.body).toEqual({
      leftoverPortions: 2,
      usedFrom: [{ ingredientId: 12, lots: [{ lotId: 120, quantity: 400 }] }],
    })
  })
})

describe('Cook Mode: Mark all Cooked offers Used from', () => {
  async function openAllSheet() {
    await screen.findByRole('article', { name: 'Step 1 of 4' })
    for (let i = 0; i < 3; i++) await userEvent.click(await screen.findByRole('button', { name: 'Next' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Mark all Cooked' }))
    const sheet = await screen.findByRole('dialog', { name: 'Mark all Cooked' })
    await within(sheet).findByRole('spinbutton', { name: 'Main Leftover portions' })
    return sheet
  }

  it('each fresh Course has its own Used from row', async () => {
    setup()
    const sheet = await openAllSheet()
    expect(await within(sheet).findAllByRole('button', { name: /Used from/ })).toHaveLength(2)
  })

  it('a Lot ticked in the Main is sent with the Main only', async () => {
    const api = setup({ 'POST /api/plan/2026-11-10/4/all/cooked': allCookedResult() })
    const sheet = await openAllSheet()
    const [mainRow] = await within(sheet).findAllByRole('button', { name: /Used from/ })
    await userEvent.click(mainRow!)
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /500 g · Fridge/ }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Mark all Cooked' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/4/all/cooked')).toHaveLength(1))
    const body = api.callsTo('POST', '/api/plan/2026-11-10/4/all/cooked')[0]!.body as { courses: Array<{ courseId: number; usedFrom?: unknown }> }
    expect(body.courses[0]).toMatchObject({ courseId: 1, usedFrom: [{ ingredientId: 11, lots: [{ lotId: 110, quantity: 400 }] }] })
    expect(body.courses[1]!.usedFrom).toBeUndefined()
  })
})
