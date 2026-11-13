// CRS F: the Plan screen with a slot that serves several Courses, end to end through the (stubbed) API.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlanScreen } from './PlanScreen'
import { courseMeal, courseSlot, meal, mockApi, planCourse, renderWithProviders, slot } from '../test-utils'
import type { Alternative, CookPreview, PlanView } from '../types'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))
afterEach(() => vi.unstubAllGlobals())

const TODAY = '2026-11-10'
const dinner = (over = {}) =>
  courseSlot(
    [
      planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { mealSlotId: 4, recipeId: 7, recipeName: 'Roast chicken', portions: 4 }) }),
      planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { mealSlotId: 4, recipeId: 8, recipeName: 'Green beans', portions: 3 }) }),
      planCourse({ courseId: 3, name: 'Dessert', main: false, optional: true, unserved: 'optional' }),
    ],
    { date: TODAY, mealSlotId: 4, name: 'Dinner', time: '19:00', at: `${TODAY}T19:00:00Z`, ...over },
  )
const view = (slots = [dinner()]): PlanView => ({ today: TODAY, horizonDays: 3, updating: false, slots })
const preview = (courseId: number, courseName: string, recipeName: string): CookPreview => ({
  meal: courseMeal(courseId, courseName, { recipeName, mealSlotId: 4 }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 2, maxLeftover: 4,
  leftoverUseBy: '2026-11-13', needs: [],
})
const alt = (id: number, name: string): Alternative => ({ recipeId: id, recipeName: name, batches: 1, newLeftoverPortions: 0, newLeftoverUseBy: '', score: 2, why: [] })

const today = async () => (await screen.findByRole('heading', { name: /· Today$/ })).closest('article') as HTMLElement
// ds-plan: a Course row is a ListRow (no li aria-label): found by the Course label in its meta line.
const row = async (name: string) =>
  within(await screen.findByRole('list', { name: 'Dinner Courses' })).getAllByRole('listitem').find((li) => li.querySelector('.list-row__meta')?.textContent?.startsWith(name)) as HTMLElement

describe('PlanScreen with Courses', () => {
  it('shows the slot once, a row per served Course with its caption, and no row for the empty optional Dessert', async () => {
    mockApi({ 'GET /api/plan': view() })
    renderWithProviders(<PlanScreen />)
    const tile = await today()
    expect(within(tile).getAllByText('Dinner')).toHaveLength(1)
    expect(within(tile).getAllByRole('listitem').map((li) => li.querySelector('.list-row__meta')?.textContent)).toEqual(['Main', 'Side'])
  })

  it('Swap on the Side asks for the Side\'s alternatives and sets the pick on the Side', async () => {
    const api = mockApi({
      'GET /api/plan': view(),
      'GET /api/plan/2026-11-10/4/2/alternatives': { alternatives: [alt(9, 'Peas')] },
      'PUT /api/plan/2026-11-10/4/2': courseMeal(2, 'Side', { recipeId: 9, recipeName: 'Peas' }),
    })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(within(await row('Side')).getByRole('button', { name: 'Swap' }))
    await userEvent.click(await screen.findByRole('button', { name: /Peas/ }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/plan/2026-11-10/4/2')).toHaveLength(1))
    expect(api.callsTo('PUT', '/api/plan/2026-11-10/4/2')[0]!.body).toEqual({ recipeId: 9 })
  })

  it('Pin from the Side\'s sheet confirms the Side only', async () => {
    const api = mockApi({ 'GET /api/plan': view(), 'POST /api/plan/2026-11-10/4/2/confirm': courseMeal(2, 'Side', { pinned: true }) })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(within(await row('Side')).getByRole('button', { name: /Green beans/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Green beans' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Pin' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/4/2/confirm')).toHaveLength(1))
  })

  it('Mark as Cooked for the Side previews and cooks the Side', async () => {
    const api = mockApi({
      'GET /api/plan': view(),
      'GET /api/plan/2026-11-10/4/2/cook': preview(2, 'Side', 'Green beans'),
      'POST /api/plan/2026-11-10/4/2/cooked': { meal: courseMeal(2, 'Side', { state: 'cooked' }), leftover: null, warnings: [], plannedFor: [] },
    })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(within(await row('Side')).getByRole('button', { name: /Green beans/ }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Green beans' })).getByRole('button', { name: 'Mark as Cooked' }))
    const sheet = await screen.findByRole('dialog', { name: 'Mark as Cooked' })
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Mark as Cooked' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/4/2/cooked')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/plan/2026-11-10/4/2/cooked')[0]!.body).toEqual({ leftoverPortions: 2 })
  })

  it('Add Dessert (slot menu) opens the Recipes marked with Dessert and pins the choice in the Dessert', async () => {
    const api = mockApi({
      'GET /api/plan': view(),
      'GET /api/recipes?course=3': [{ id: 12, name: 'Tiramisu', tags: [], courses: [{ id: 3, name: 'Dessert' }] }],
      'PUT /api/plan/2026-11-10/4/3': courseMeal(3, 'Dessert', { recipeId: 12, recipeName: 'Tiramisu', pinned: true }),
    })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Dinner actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add Dessert' }))
    await userEvent.click(await screen.findByRole('button', { name: /Tiramisu/ }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/plan/2026-11-10/4/3')).toHaveLength(1))
    expect(api.callsTo('PUT', '/api/plan/2026-11-10/4/3')[0]!.body).toEqual({ recipeId: 12 })
  })

  it('Not cooked: whole slot posts to .../all/not-cooked once', async () => {
    const api = mockApi({ 'GET /api/plan': view(), 'POST /api/plan/2026-11-10/4/all/not-cooked': { meals: [] } })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Dinner actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Not cooked: whole slot' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/4/all/not-cooked')).toHaveLength(1))
  })

  it('Mark all Cooked loads each Course\'s proposal and confirms them together', async () => {
    const api = mockApi({
      'GET /api/plan': view(),
      'GET /api/plan/2026-11-10/4/1/cook': preview(1, 'Main', 'Roast chicken'),
      'GET /api/plan/2026-11-10/4/2/cook': preview(2, 'Side', 'Green beans'),
      'POST /api/plan/2026-11-10/4/all/cooked': { meals: [], leftovers: [], warnings: [], plannedFor: [] },
    })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Dinner actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mark all Cooked' }))
    const sheet = await screen.findByRole('dialog', { name: 'Mark all Cooked' })
    await within(sheet).findByRole('spinbutton', { name: 'Side Leftover portions' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Decrease Side Leftover portions' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Mark all Cooked' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/4/all/cooked')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/plan/2026-11-10/4/all/cooked')[0]!.body).toEqual({
      courses: [{ courseId: 1, leftoverPortions: 2 }, { courseId: 2, leftoverPortions: 1.5 }],
    })
  })
})

describe('PlanScreen with one Course (regression guards)', () => {
  const plain = () => slot({ date: TODAY, mealSlotId: 2, meal: meal({ date: TODAY, mealSlotId: 2, recipeId: 7, recipeName: 'Chicken' }) })

  it('a one-Course slot pins through the Course route (the course-less routes are gone)', async () => {
    const one = courseSlot([planCourse({ courseId: 1, meal: courseMeal(1, 'Main', { date: TODAY, mealSlotId: 2, recipeId: 7, recipeName: 'Chicken' }) })], { date: TODAY, mealSlotId: 2 })
    const api = mockApi({ 'GET /api/plan': view([one]), 'POST /api/plan/2026-11-10/2/1/confirm': meal({ pinned: true }) })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(within(await today()).getByRole('button', { name: /Chicken/ }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Chicken' })).getByRole('button', { name: 'Pin' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/2/1/confirm')).toHaveLength(1))
    expect(api.calls.some((c) => c.path === '/api/plan/2026-11-10/2/confirm')).toBe(false)
  })

  // ds-plan: a one-Course slot is the same structure (header, then the Courses list) with one row and no caption.
  it('shows no Course caption, in a Courses list of one row', async () => {
    mockApi({ 'GET /api/plan': view([plain()]) })
    renderWithProviders(<PlanScreen />)
    const tile = await today()
    const list = within(tile).getByRole('list', { name: /Courses/ })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(list.querySelector('.list-row__meta')).toBeNull()
  })
})
