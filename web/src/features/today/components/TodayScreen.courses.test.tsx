// CRS F (spec 7.5, 8): Today with a slot that serves several Courses: the Tonight tile is the slot block, To confirm groups Courses.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, mockApi, planCourse, renderWithProviders, slot } from '../../plan/test-utils'
import type { CookPreview, PlanCourse, PlanSlot } from '../../plan/types'
import { TodayScreen } from './TodayScreen'

const h = vi.hoisted(() => ({ now: new Date('2026-11-10T17:00:00Z'), toConfirm: [] as unknown[], nextSlot: null as unknown }))

vi.mock('../seams', () => ({
  useScanSessionActive: () => false,
  useTodayPlan: () => ({ today: '2026-11-10', hasNextMeal: h.nextSlot !== null, toConfirm: h.toConfirm.length, couldntPlan: 0, leftovers: 0, loading: false }),
  useTodayStock: () => ({ spoiled: 0, useSoon: [], loading: false }),
  useTodayTileData: () => ({
    now: h.now, nextSlot: h.nextSlot, nextDay: 'today', nextAction: 'cook', toConfirm: h.toConfirm, couldntPlan: [], leftovers: [], planToday: '2026-11-10',
    spoiled: [], stockToday: '2026-11-10', system: 'metric', useSoon: [], throwOut: vi.fn(), keep: vi.fn(), planLoading: false, stockLoading: false,
  }),
  ShoppingListSeam: () => createElement('p', null, 'The Shopping List'),
}))

const routed = (
  <Routes>
    <Route path="/" element={<TodayScreen />} />
    <Route path="/cook/meal/:date/:slotId" element={<p>Cook Mode screen</p>} />
    <Route path="/plan" element={<p>Plan screen</p>} />
  </Routes>
)
const base = { 'GET /api/today/advance-steps': { steps: [] }, 'GET /api/today/streak': { days: 0 } }
const main = (over: Partial<PlanCourse> = {}) => planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { mealSlotId: 4, recipeName: 'Roast chicken' }), ...over })
const side = (over: Partial<PlanCourse> = {}) => planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { mealSlotId: 4, recipeName: 'Green beans' }), ...over })
const dessert = () => planCourse({ courseId: 3, name: 'Dessert', main: false, optional: true, unserved: 'optional' })
const dinner = (courses: PlanCourse[] = [main(), side(), dessert()]): PlanSlot =>
  courseSlot(courses, { date: '2026-11-10', mealSlotId: 4, name: 'Dinner', time: '19:30', at: '2026-11-10T19:30:00Z', cookMinutes: 30, startBy: '19:00' })
const preview = (courseId: number, courseName: string, recipeName: string, date = '2026-11-10'): CookPreview => ({
  meal: courseMeal(courseId, courseName, { recipeName, mealSlotId: 4, date }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-13', needs: [],
})

afterEach(() => {
  h.now = new Date('2026-11-10T17:00:00Z')
  h.toConfirm = []
  h.nextSlot = null
  vi.unstubAllGlobals()
})

describe('Today: the Tonight tile is the slot block', () => {
  it('the main Course is the hero, the Side a compact row, "start 19:00" and "Cook · 30 min" belong to the timeline', async () => {
    h.nextSlot = dinner()
    mockApi(base)
    renderWithProviders(routed, '/')
    const hero = (await screen.findByRole('group', { name: 'Today' })).firstElementChild as HTMLElement
    expect(within(hero).getByRole('heading', { name: 'Roast chicken' })).toBeInTheDocument()
    expect(within(within(hero).getByRole('listitem', { name: 'Side' })).getByRole('button', { name: /Green beans/ })).toBeInTheDocument()
    expect(within(hero).getByText('start 19:00')).toBeInTheDocument()
    expect(within(hero).queryByRole('listitem', { name: 'Dessert' })).not.toBeInTheDocument()
  })

  it('Cook opens the slot\'s timeline: /cook/meal/<date>/<slot>', async () => {
    h.nextSlot = dinner()
    mockApi(base)
    renderWithProviders(routed, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Cook · 30 min' }))
    expect(await screen.findByText('Cook Mode screen')).toBeInTheDocument()
  })

  it('Pin on the Side row pins the Side only', async () => {
    h.nextSlot = dinner()
    const api = mockApi({ ...base, 'POST /api/plan/2026-11-10/4/2/confirm': courseMeal(2, 'Side', { pinned: true }) })
    renderWithProviders(routed, '/')
    await userEvent.click(within(await screen.findByRole('listitem', { name: 'Side' })).getByRole('button', { name: 'Pin' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/4/2/confirm')).toHaveLength(1))
  })

  it('Mark as Cooked on the Side row opens the Side\'s own sheet and cooks only the Side', async () => {
    h.nextSlot = dinner()
    const api = mockApi({
      ...base,
      'GET /api/plan/2026-11-10/4/2/cook': preview(2, 'Side', 'Green beans'),
      'POST /api/plan/2026-11-10/4/2/cooked': { meal: courseMeal(2, 'Side', { state: 'cooked' }), leftover: null, warnings: [], plannedFor: [] },
    })
    renderWithProviders(routed, '/')
    await userEvent.click(within(await screen.findByRole('listitem', { name: 'Side' })).getByRole('button', { name: 'Mark as Cooked' }))
    const sheet = await screen.findByRole('dialog', { name: 'Mark as Cooked' })
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Mark as Cooked' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/4/2/cooked')).toHaveLength(1))
  })

  it('the slot menu: Not cooked: whole slot, and Add Dessert opening the Recipes for the Dessert', async () => {
    h.nextSlot = dinner()
    const api = mockApi({
      ...base,
      'POST /api/plan/2026-11-10/4/all/not-cooked': { meals: [] },
      'GET /api/recipes?course=3': [{ id: 12, name: 'Tiramisu', tags: [], courses: [{ id: 3, name: 'Dessert' }] }],
      'PUT /api/plan/2026-11-10/4/3': courseMeal(3, 'Dessert', { recipeId: 12 }),
    })
    renderWithProviders(routed, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Dinner actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add Dessert' }))
    await userEvent.click(await screen.findByRole('button', { name: /Tiramisu/ }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/plan/2026-11-10/4/3')).toHaveLength(1))
    await userEvent.click(screen.getByRole('button', { name: 'Dinner actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Not cooked: whole slot' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/4/all/not-cooked')).toHaveLength(1))
  })
})

describe('Today: To confirm groups the Courses of a slot', () => {
  const entry = (courseId: number, courseName: string, recipeName: string): PlanSlot =>
    slot({ date: '2026-11-09', mealSlotId: 4, courseId, courseName, meal: courseMeal(courseId, courseName, { mealSlotId: 4, recipeName, date: '2026-11-09' }) })

  it('one heading for the slot, each Course confirmed on its own', async () => {
    h.toConfirm = [entry(1, 'Main', 'Roast chicken'), entry(2, 'Side', 'Green beans')]
    const api = mockApi({
      ...base,
      'GET /api/plan/2026-11-09/4/2/cook': preview(2, 'Side', 'Green beans', '2026-11-09'),
      'POST /api/plan/2026-11-09/4/2/cooked': { meal: courseMeal(2, 'Side', { state: 'cooked' }), leftover: null, warnings: [], plannedFor: [] },
    })
    renderWithProviders(routed, '/')
    expect(await screen.findByText('Mon Dinner: Roast chicken, Green beans')).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('group', { name: 'Side' })).getByRole('button', { name: 'Yes, Cooked' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-09/4/2/cooked')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/plan/2026-11-09/4/2/cooked')[0]!.body).toEqual({ leftoverPortions: 2 })
  })

  it('Not cooked on one Course skips that Course only', async () => {
    h.toConfirm = [entry(1, 'Main', 'Roast chicken'), entry(2, 'Side', 'Green beans')]
    const api = mockApi({ ...base, 'POST /api/plan/2026-11-09/4/2/not-cooked': courseMeal(2, 'Side', { state: 'skipped' }) })
    renderWithProviders(routed, '/')
    await userEvent.click(within(await screen.findByRole('group', { name: 'Side' })).getByRole('button', { name: 'Not cooked' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-09/4/2/not-cooked')).toHaveLength(1))
  })

  it('Mark all Cooked opens one sheet with each Course and confirms them together', async () => {
    h.toConfirm = [entry(1, 'Main', 'Roast chicken'), entry(2, 'Side', 'Green beans')]
    const api = mockApi({
      ...base,
      'GET /api/plan/2026-11-09/4/1/cook': preview(1, 'Main', 'Roast chicken', '2026-11-09'),
      'GET /api/plan/2026-11-09/4/2/cook': preview(2, 'Side', 'Green beans', '2026-11-09'),
      'POST /api/plan/2026-11-09/4/all/cooked': { meals: [], leftovers: [], warnings: [], plannedFor: [] },
    })
    renderWithProviders(routed, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Mark all Cooked' }))
    const sheet = await screen.findByRole('dialog', { name: 'Mark all Cooked' })
    await within(sheet).findByRole('spinbutton', { name: 'Main Leftover portions' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Mark all Cooked' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-09/4/all/cooked')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/plan/2026-11-09/4/all/cooked')[0]!.body).toEqual({
      courses: [{ courseId: 1, leftoverPortions: 2 }, { courseId: 2, leftoverPortions: 2 }],
    })
  })
})
