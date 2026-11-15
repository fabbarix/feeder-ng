// B9-38 on the Plan screen (PC-09, PC-10, SHORT-02): the Planned Meal sheet's footer ⋮ reaches Swap, Choose a Recipe and Not cooked; the sheets it opens
// name their day, Meal Slot and Course; a Cooked meal's sheet shows the Leftover it made and handles it. 2026-11-14 is a Saturday, 2026-11-17 a Tuesday.
// NEEDS from the developer outside the package's listed files: hooks/usePlanScreen.ts passes `leftover`, `onLeftoverAction` and `onNotCooked` to
// PlannedMealSheet, and `slot` and `courseId` to Swap and Choose (the Plan screen's own hook; Today's hooks/useTonightSheets.ts the same).
import { onlineManager } from '@tanstack/react-query'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { leftover } from '../../../lib/leftovers/fixtures'
const sse = vi.hoisted(() => {
  const connection = { subscribe: vi.fn(() => vi.fn()), onReconnect: vi.fn(() => vi.fn()), close: vi.fn() }
  return { connectEvents: vi.fn(() => connection) }
})
vi.mock('../../../lib/sse', () => ({ connectEvents: sse.connectEvents }))

import { ME } from '../test-utils.undo'
import { findToastWith } from '../test-utils.undo'
import { courseMeal, courseSlot, meal, mockApi, planCourse, renderWithProviders, slot } from '../test-utils'
import type { PlanView } from '../types'
import { PlanScreen } from './PlanScreen'

beforeEach(() => vi.stubGlobal('EventSource', class {}))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  onlineManager.setOnline(true)
})

const resolution = { kind: 'cooked', markedOn: '2026-11-14', markedAt: '2026-11-14T07:40:00Z', markedBy: 'Anna', leftoverPortions: 2.5, canUndo: true }
const view: PlanView = {
  today: '2026-11-14', horizonDays: 7, updating: false,
  slots: [
    slot({ date: '2026-11-14', mealSlotId: 1, name: 'Breakfast', time: '08:30', meal: { ...meal({ date: '2026-11-14', mealSlotId: 1, recipeId: 5, recipeName: 'Slow cooker beef and barley stew', state: 'cooked' }), resolution } as never }),
    courseSlot(
      [
        planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { date: '2026-11-14', mealSlotId: 3, recipeName: 'Roast chicken' }) }),
        planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { date: '2026-11-14', mealSlotId: 3, recipeName: 'Green beans' }) }),
      ],
      { date: '2026-11-14', mealSlotId: 3, name: 'Dinner', time: '19:00' },
    ),
    slot({ date: '2026-11-17', mealSlotId: 1, name: 'Breakfast', time: '08:00', meal: meal({ date: '2026-11-17', mealSlotId: 1, recipeId: 8, recipeName: 'Pancakes' }) }),
  ],
}
const stewLeftover = leftover({ id: 7, recipeId: 5, recipeName: 'Slow cooker beef and barley stew', portions: 2.5, cookedOn: '2026-11-14', useBy: '2026-11-17', fromDate: '2026-11-14', fromMealSlotId: 1, fromCourseId: 1, plannedPortions: 1.25 })
const alternatives = { alternatives: [{ recipeId: 21, recipeName: 'Pizza', batches: 1, newLeftoverPortions: 0, newLeftoverUseBy: '', score: 1, why: [{ code: 'favourite', members: ['Ben'] }] }] }
const base = {
  'GET /api/plan': view, 'GET /api/me': ME, 'GET /api/plan/leftovers': { leftovers: [stewLeftover] }, 'GET /api/storage-places': [], 'GET /api/household/settings': {},
  'GET /api/plan/2026-11-17/1/1/alternatives': alternatives, 'GET /api/recipes?course=1': [{ id: 31, name: 'Omelette', tags: [], courses: [{ id: 1 }] }], 'GET /api/recipes': [{ id: 31, name: 'Omelette', tags: [], courses: [{ id: 1 }] }],
}
const dayTile = async (heading: RegExp) => (await screen.findByRole('heading', { name: heading })).closest('article') as HTMLElement
const open = async (day: RegExp, recipe: string) => {
  const tile = await dayTile(day)
  await userEvent.click(within(within(tile).getByText(recipe).closest('li') as HTMLElement).getByRole('button', { name: new RegExp(`^${recipe}$`) }))
  return screen.findByRole('dialog', { name: new RegExp(` ${recipe}$`) })
}
const more = async (sheet: HTMLElement, item: string) => {
  await userEvent.click(within(sheet).getByRole('button', { name: /^More for / }))
  await userEvent.click(await screen.findByRole('menuitem', { name: item }))
}

describe('PlanScreen: Swap and Choose a Recipe name the day, Meal Slot and Course', () => {
  it('a future meal\'s Swap button opens "Swap Pancakes" under "Tue 17 · Breakfast · Main", with Now and Instead', async () => {
    mockApi(base)
    renderWithProviders(<PlanScreen />)
    const sheet = await open(/^Tue 17/, 'Pancakes')
    expect(sheet).toHaveAccessibleName('Tue 17 · Breakfast 08:00 Pancakes')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Swap' }))
    const swap = await screen.findByRole('dialog', { name: 'Tue 17 · Breakfast · Main Swap Pancakes' })
    expect(await within(swap).findByRole('button', { name: 'Pizza' })).toBeInTheDocument()
    expect(within(swap).getByRole('list', { name: 'Now' })).toBeInTheDocument()
    expect(within(swap).getByText("Ben's favourite")).toBeInTheDocument()
  })

  it('Choose a Recipe from the ⋮ is named by the day, Meal Slot and Course, and searches that Course\'s Recipes', async () => {
    mockApi(base)
    renderWithProviders(<PlanScreen />)
    await more(await open(/^Tue 17/, 'Pancakes'), 'Choose a Recipe')
    const choose = await screen.findByRole('dialog', { name: 'Tue 17 · Breakfast · Main Choose a Recipe' })
    expect(within(choose).getByRole('searchbox', { name: 'Search Recipes' })).toBeInTheDocument()
    expect(await within(choose).findByRole('button', { name: 'Omelette' })).toBeInTheDocument()
  })
})

describe("PlanScreen: Not cooked from the Planned Meal sheet's ⋮", () => {
  it('acts at once (no Mark as Cooked sheet), posts not-cooked for the Course and toasts with Undo', async () => {
    const api = mockApi({ ...base, 'POST /api/plan/2026-11-14/3/1/not-cooked': { ...meal({ state: 'skipped' }), changes: [], undoToken: 'tok-nc' } })
    renderWithProviders(<PlanScreen />)
    await more(await open(/^Sat 14/, 'Roast chicken'), 'Not cooked')
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-14/3/1/not-cooked')).toHaveLength(1))
    expect(screen.queryByRole('dialog', { name: 'Mark as Cooked' })).toBeNull()
    expect(await findToastWith('Not cooked')).toBeTruthy()
  })
})

describe("PlanScreen: a Cooked meal's Planned Meal sheet shows its Leftover", () => {
  it('the block names the portions and the Use-by, and Had it opens the Had it sheet for that Leftover', async () => {
    mockApi(base)
    renderWithProviders(<PlanScreen />)
    const sheet = await open(/^Sat 14/, 'Slow cooker beef and barley stew')
    const block = await within(sheet).findByRole('group', { name: 'Leftover of Slow cooker beef and barley stew' })
    expect(within(block).getByText('2.5 portions left · Use by Tue')).toBeInTheDocument()
    await userEvent.click(within(block).getByRole('button', { name: 'Had it' }))
    expect(await screen.findByRole('dialog', { name: 'How many portions of Slow cooker beef and barley stew did you have?' })).toBeInTheDocument()
  })

  it('a Cooked meal with no Leftover (none kept) has no block', async () => {
    mockApi({ ...base, 'GET /api/plan/leftovers': { leftovers: [] } })
    renderWithProviders(<PlanScreen />)
    const sheet = await open(/^Sat 14/, 'Slow cooker beef and barley stew')
    expect(within(sheet).queryByRole('group', { name: /^Leftover of/ })).toBeNull()
  })
})
