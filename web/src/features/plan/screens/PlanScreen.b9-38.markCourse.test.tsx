// B9-38 (PC-10, user decision): picking from "Other Recipes" in Choose a Recipe works in one write. The plan PUT carries
// `markCourse: true`; the toast reads "<Recipe> chosen for <slot> and marked as <Course>" with "It stays marked as <Course>." as
// its subline, and its Undo restores the plan. A Recipe from the marked list is set as before, without markCourse.
// 2026-11-14 is a Saturday.
import { onlineManager } from '@tanstack/react-query'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const sse = vi.hoisted(() => {
  const connection = { subscribe: vi.fn(() => vi.fn()), onReconnect: vi.fn(() => vi.fn()), close: vi.fn() }
  return { connectEvents: vi.fn(() => connection) }
})
vi.mock('../../../lib/sse', () => ({ connectEvents: sse.connectEvents }))

import { ME, findToastWith, pressInToast } from '../test-utils.undo'
import { courseMeal, courseSlot, mockApi, planCourse, renderWithProviders } from '../test-utils'
import type { PlanView } from '../types'
import { PlanScreen } from './PlanScreen'

beforeEach(() => vi.stubGlobal('EventSource', class {}))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  onlineManager.setOnline(true)
})

const view: PlanView = {
  today: '2026-11-14', horizonDays: 7, updating: false,
  slots: [
    courseSlot(
      [
        planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { date: '2026-11-14', mealSlotId: 3, recipeName: 'Roast chicken' }) }),
        planCourse({ courseId: 3, name: 'Dessert', main: false, meal: courseMeal(3, 'Dessert', { date: '2026-11-14', mealSlotId: 3, recipeId: 40, recipeName: 'Fruit salad' }) }),
      ],
      { date: '2026-11-14', mealSlotId: 3, name: 'Dinner', time: '19:00' },
    ),
  ],
}
const cake = { id: 41, name: 'Lemon ricotta cake', tags: [], courses: [{ id: 3 }] }
const apples = { id: 42, name: 'Baked apples', tags: [], courses: [{ id: 1 }] }
const base = {
  'GET /api/plan': view, 'GET /api/me': ME, 'GET /api/plan/leftovers': { leftovers: [] }, 'GET /api/storage-places': [], 'GET /api/household/settings': {},
  'GET /api/recipes?course=3': [cake], 'GET /api/recipes': [cake, apples],
}
const PUT = '/api/plan/2026-11-14/3/3'

async function openChooser() {
  renderWithProviders(<PlanScreen />)
  const tile = (await screen.findByRole('heading', { name: /^Sat 14/ })).closest('article') as HTMLElement
  await userEvent.click(within(within(tile).getByText('Fruit salad').closest('li') as HTMLElement).getByRole('button', { name: /^Fruit salad$/ }))
  const sheet = await screen.findByRole('dialog', { name: / Fruit salad$/ })
  await userEvent.click(within(sheet).getByRole('button', { name: /^More for / }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Choose a Recipe' }))
  return screen.findByRole('dialog', { name: 'Sat 14 · Dinner · Dessert Choose a Recipe' })
}

describe('PlanScreen: Choose a Recipe for a Course other than the main one', () => {
  it('lists "Marked as Dessert" and "Other Recipes"; an Other Recipe carries "Not marked as Dessert"', async () => {
    mockApi(base)
    const choose = await openChooser()
    const other = await within(choose).findByRole('list', { name: 'Other Recipes' })
    expect(within(other).getByText('Baked apples')).toBeInTheDocument()
    expect(within(other).getByText('Not marked as Dessert')).toBeInTheDocument()
    expect(within(within(choose).getByRole('list', { name: 'Marked as Dessert' })).getByText('Lemon ricotta cake')).toBeInTheDocument()
  })

  it('picking an Other Recipe PUTs markCourse, and the toast says it was chosen and marked, with Undo restoring the plan', async () => {
    const api = mockApi({
      ...base,
      [`PUT ${PUT}`]: { ...courseMeal(3, 'Dessert', { date: '2026-11-14', mealSlotId: 3, recipeId: 42, recipeName: 'Baked apples', pinned: true }), changes: [], undoToken: 'tok-mark' },
      'POST /api/plan/restore': { changes: [] },
    })
    const choose = await openChooser()
    await userEvent.click(await within(choose).findByRole('button', { name: 'Baked apples' }))
    await waitFor(() => expect(api.callsTo('PUT', PUT)).toHaveLength(1))
    expect(api.callsTo('PUT', PUT)[0]!.body).toEqual({ recipeId: 42, markCourse: true })
    const toast = await findToastWith('Baked apples chosen for Sat Dinner and marked as Dessert')
    expect(toast).toHaveTextContent('It stays marked as Dessert.')
    await pressInToast(toast, /^Undo/)
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/restore')[0]?.body).toEqual({ undoToken: 'tok-mark' }))
  })

  it('a Recipe already marked for the Course is set as before, without markCourse', async () => {
    const api = mockApi({ ...base, [`PUT ${PUT}`]: { ...courseMeal(3, 'Dessert', { date: '2026-11-14', mealSlotId: 3, recipeId: 41, recipeName: 'Lemon ricotta cake', pinned: true }), changes: [] } })
    const choose = await openChooser()
    await userEvent.click(await within(choose).findByRole('button', { name: 'Lemon ricotta cake' }))
    await waitFor(() => expect(api.callsTo('PUT', PUT)).toHaveLength(1))
    expect(api.callsTo('PUT', PUT)[0]!.body).toEqual({ recipeId: 41 })
  })
})
