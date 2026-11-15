// B9-26 (PC-01, SAFE-03, SAFE-07) on the Plan screen: What changed after a Swap (toast, marked rows, Review, Undo), another User's edit,
// the Regenerate question (Cancel is focused, Enter does not regenerate) and its Undo, Regenerate offline, Not cooked: whole slot with
// Undo, and Undo Cooked / Cooked after all from the Planned Meal sheet. 2026-11-14 is a Saturday.
//
// NEEDS from the developer outside B9-26's own files (listed in the hand-back): PlanScreen.tsx mounts <ReplanReviewSheet> and provides
// ReplanMarksContext; it passes `onUndoCooked`, `onUndoNotCooked`, `onCookedAfterAll`, `timeZone` and `offline` to PlannedMealSheet.
import { onlineManager } from '@tanstack/react-query'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sse = vi.hoisted(() => {
  const handlers: Record<string, ((data?: unknown) => void)[]> = {}
  const connection = {
    subscribe: vi.fn((topic: string, handler: (data?: unknown) => void) => {
      ;(handlers[topic] ??= []).push(handler)
      return vi.fn()
    }),
    onReconnect: vi.fn(() => vi.fn()),
    close: vi.fn(),
  }
  return { handlers, connectEvents: vi.fn(() => connection) }
})
vi.mock('../../../lib/sse', () => ({ connectEvents: sse.connectEvents }))

import { ME } from '../test-utils.undo'
import { dinnerChange, findToastWith, lunchChange, noToast, pressInToast, toastWith } from '../test-utils.undo'
import { courseMeal, courseSlot, meal, mockApi, planCourse, renderWithProviders, slot } from '../test-utils'
import type { PlanView } from '../types'
import { PlanScreen } from './PlanScreen'

beforeEach(() => {
  for (const k of Object.keys(sse.handlers)) delete sse.handlers[k]
  vi.stubGlobal('EventSource', class {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  onlineManager.setOnline(true) // the offline test must not leave the query client paused for the next one
})

const resolution = { kind: 'cooked', markedOn: '2026-11-14', markedAt: '2026-11-14T07:40:00Z', markedBy: 'Anna', leftoverPortions: 1.25, canUndo: true }
const view: PlanView = {
  today: '2026-11-14', horizonDays: 7, updating: false,
  slots: [
    slot({ date: '2026-11-14', mealSlotId: 1, name: 'Breakfast', time: '08:30', meal: { ...meal({ date: '2026-11-14', mealSlotId: 1, recipeId: 5, recipeName: 'Slow cooker beef and barley stew', state: 'cooked', pinned: true }), resolution } as never }),
    courseSlot(
      [
        planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { date: '2026-11-14', mealSlotId: 3, recipeName: 'Roast chicken' }) }),
        planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { date: '2026-11-14', mealSlotId: 3, recipeName: 'Green beans' }) }),
      ],
      { date: '2026-11-14', mealSlotId: 3, name: 'Dinner', time: '19:00' },
    ),
    slot({ date: '2026-11-17', mealSlotId: 1, name: 'Breakfast', time: '08:00', meal: meal({ date: '2026-11-17', mealSlotId: 1, recipeId: 8, recipeName: 'Pancakes' }) }),
    slot({ date: '2026-11-17', mealSlotId: 2, name: 'Lunch', time: '12:30', meal: meal({ date: '2026-11-17', mealSlotId: 2, recipeId: 1, recipeName: 'Lentil soup' }) }),
    slot({ date: '2026-11-18', mealSlotId: 3, name: 'Dinner', time: '19:00', meal: meal({ date: '2026-11-18', mealSlotId: 3, recipeId: 4, recipeName: 'Roast chicken' }) }),
  ],
}
const alternatives = { alternatives: [{ recipeId: 21, recipeName: 'Pizza', batches: 1, newLeftoverPortions: 0, newLeftoverUseBy: '2026-11-20', score: 1, why: [] }] }
const written = { ...meal({ date: '2026-11-17', mealSlotId: 1, recipeId: 21, pinned: true }), changes: [lunchChange, dinnerChange], undoToken: 'tok-1' }
const base = { 'GET /api/plan': view, 'GET /api/me': ME, 'GET /api/plan/2026-11-17/1/1/alternatives': alternatives, 'PUT /api/plan/2026-11-17/1/1': written }

const dayTile = async (heading: RegExp) => (await screen.findByRole('heading', { name: heading })).closest('article') as HTMLElement
const rowOf = (tile: HTMLElement, recipe: string) => within(tile).getByText(recipe).closest('li') as HTMLElement
const emit = (data: unknown) => act(() => void sse.handlers['plan']?.forEach((h) => h(data)))

async function swapPancakes() {
  const tile = await dayTile(/^Tue 17/)
  await userEvent.click(within(rowOf(tile, 'Pancakes')).getByRole('button', { name: 'Swap' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Pizza' }))
  return findToastWith('Swapped Tue Breakfast')
}

describe('PlanScreen: What changed after a Swap (PC-01)', () => {
  it('toasts the headline, the count, the meals, Review and Undo', async () => {
    mockApi(base)
    renderWithProviders(<PlanScreen />)
    const toast = await swapPancakes()
    expect(toast).toHaveTextContent('2 other meals changed')
    expect(toast).toHaveTextContent('Tue Lunch is now Chicken curry. Wed Dinner is now Lentil soup.')
    expect(within(toast).getByRole('button', { name: 'Review 2 changed meals' })).toBeInTheDocument()
    expect(within(toast).getByRole('button', { name: 'Undo the Swap and 2 other changes' })).toBeInTheDocument()
  })

  it('marks the changed rows (data-changed) with "was ..." until Review is opened', async () => {
    mockApi(base)
    renderWithProviders(<PlanScreen />)
    await swapPancakes()
    await waitFor(() => expect(document.querySelectorAll('li[data-changed]')).toHaveLength(2))
    const lunch = rowOf(await dayTile(/^Tue 17/), 'Lentil soup')
    expect(lunch).toHaveAttribute('data-changed')
    expect(lunch.querySelector('.plan-row__was')).toHaveTextContent('was Lentil soup')
    await userEvent.click(within(await findToastWith('Swapped Tue Breakfast')).getByRole('button', { name: 'Review 2 changed meals' }))
    await waitFor(() => expect(document.querySelectorAll('li[data-changed]')).toHaveLength(0))
  })

  it('Review opens "What changed" with the rows grouped by day; Keep the changes closes it and writes nothing', async () => {
    const api = mockApi(base)
    renderWithProviders(<PlanScreen />)
    await pressInToast(await swapPancakes(), 'Review 2 changed meals')
    const sheet = await screen.findByRole('dialog', { name: /What changed/ })
    expect(sheet).toHaveTextContent('After your Swap · 2 other meals')
    expect(within(sheet).getByRole('heading', { name: 'Tue 17' })).toBeInTheDocument()
    expect(within(sheet).getByRole('list', { name: 'Wed 18' })).toBeInTheDocument()
    expect(sheet.querySelectorAll('li.detail-row')).toHaveLength(2)
    await userEvent.click(within(sheet).getByRole('button', { name: 'Keep the changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /What changed/ })).toBeNull())
    expect(api.calls.filter((c) => c.method !== 'GET' && c.method !== 'PUT')).toHaveLength(0)
  })

  it('Undo all in the sheet restores the plan with the token', async () => {
    const api = mockApi({ ...base, 'POST /api/plan/restore': { changes: [] } })
    renderWithProviders(<PlanScreen />)
    await pressInToast(await swapPancakes(), 'Review 2 changed meals')
    await userEvent.click(within(await screen.findByRole('dialog', { name: /What changed/ })).getByRole('button', { name: 'Undo all' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/restore')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/plan/restore')[0]?.body).toEqual({ undoToken: 'tok-1' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /What changed/ })).toBeNull())
  })

  it('Undo in the toast restores with the token and replans nothing else', async () => {
    const api = mockApi({ ...base, 'POST /api/plan/restore': { changes: [] } })
    renderWithProviders(<PlanScreen />)
    await pressInToast(await swapPancakes(), 'Undo the Swap and 2 other changes')
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/restore')).toHaveLength(1))
    expect(api.calls.filter((c) => c.method === 'PUT')).toHaveLength(1)
    expect(api.calls.some((c) => c.path.endsWith('/unpin'))).toBe(false)
  })

  it("another User's edit: a toast with Review only, and the sheet names them and has no Undo all", async () => {
    mockApi({ ...base })
    renderWithProviders(<PlanScreen />)
    await dayTile(/^Tue 17/)
    emit({ changed: 'plan', reason: 'pinned', by: { userId: 2, name: 'Anna' }, target: { date: '2026-11-18', mealSlotId: 3, courseId: 1 }, changes: [lunchChange, dinnerChange] })
    const toast = await findToastWith('Anna changed Wed Dinner')
    expect(within(toast).queryByRole('button', { name: /^Undo/ })).toBeNull()
    await userEvent.click(within(toast).getByRole('button', { name: 'Review 2 changed meals' }))
    const sheet = await screen.findByRole('dialog', { name: /What changed/ })
    expect(sheet).toHaveTextContent("After Anna's change · 2 other meals")
    expect(within(sheet).queryByRole('button', { name: 'Undo all' })).toBeNull()
  })

  it('your own edit coming back on the event stream says nothing more', async () => {
    mockApi({ ...base })
    renderWithProviders(<PlanScreen />)
    await dayTile(/^Tue 17/)
    await waitFor(() => expect(sse.handlers['plan']?.length ?? 0).toBeGreaterThan(0))
    emit({ changed: 'plan', reason: 'pinned', by: { userId: ME.id, name: ME.displayName }, target: { date: '2026-11-17', mealSlotId: 1, courseId: 1 }, changes: [lunchChange] })
    await Promise.resolve()
    noToast()
  })
})

describe('PlanScreen: Regenerate (SAFE-07)', () => {
  const dry = { replaces: 26, bought: [{ date: '2026-11-18', mealSlotName: 'Dinner', courseName: 'Main', recipeName: 'Roast chicken with lemon, garlic and thyme', ingredients: ['carrot'] }] }
  const regenerated = { placed: 20, kept: 3, unfilled: 0, changed: 18, changes: [lunchChange], undoToken: 'tok-r' }
  const routes = { ...base, 'POST /api/plan/regenerate?dryRun=1': dry, 'POST /api/plan/regenerate': regenerated, 'POST /api/plan/restore': { changes: [lunchChange] } }
  const ask = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Regenerate' }))
    return screen.findByRole('dialog', { name: 'Regenerate the plan?' })
  }

  it('the question: the lead, the note with the Undo, the Bought meals behind a summary as rows; no Close', async () => {
    mockApi(routes)
    renderWithProviders(<PlanScreen />)
    const dialog = await ask()
    expect(within(dialog).getByText('26 unpinned Planned Meals will change.')).toBeInTheDocument()
    expect(within(dialog).getByText('Pinned and Cooked ones stay. You can undo it straight after.')).toBeInTheDocument()
    expect(within(dialog).getByText('1 Bought Planned Meal is replaced')).toBeInTheDocument()
    const row = dialog.querySelector('li.detail-row')!
    expect(row).toHaveTextContent('Wed Dinner')
    expect(row).toHaveTextContent('carrot bought')
    expect(row).toHaveTextContent('Roast chicken with lemon, garlic and thyme')
    expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('Enter on open does not regenerate: the outline Cancel has the focus', async () => {
    const api = mockApi(routes)
    renderWithProviders(<PlanScreen />)
    const dialog = await ask()
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
    await waitFor(() => expect(cancel).toHaveFocus())
    expect(cancel).toHaveAttribute('data-variant', 'secondary')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Regenerate the plan?' })).toBeNull())
    expect(api.callsTo('POST', '/api/plan/regenerate')).toHaveLength(0)
  })

  it('after the run: "Plan regenerated: 18 Planned Meals changed" with Undo; Undo gives "Your previous plan is back"', async () => {
    const api = mockApi(routes)
    renderWithProviders(<PlanScreen />)
    await userEvent.click(within(await ask()).getByRole('button', { name: 'Regenerate' }))
    const toast = await findToastWith('Plan regenerated: 18 Planned Meals changed')
    expect(toast.querySelector('.toast__title svg')).toBeNull()
    await pressInToast(toast, 'Undo Regenerate')
    expect(await findToastWith('Your previous plan is back')).toBeTruthy()
    expect(api.callsTo('POST', '/api/plan/restore')[0]?.body).toEqual({ undoToken: 'tok-r' })
  })

  it('Regenerate is disabled while offline (it needs the server), and asks nothing', async () => {
    const api = mockApi(routes)
    renderWithProviders(<PlanScreen />)
    const button = await screen.findByRole('button', { name: 'Regenerate' })
    await dayTile(/^Tue 17/)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    act(() => void window.dispatchEvent(new Event('offline')))
    await waitFor(() => expect(button.hasAttribute('disabled') || button.getAttribute('aria-disabled') === 'true').toBe(true))
    await userEvent.click(button)
    expect(api.callsTo('POST', '/api/plan/regenerate?dryRun=1')).toHaveLength(0)
    expect(screen.queryByRole('dialog', { name: 'Regenerate the plan?' })).toBeNull()
  })
})

describe('PlanScreen: Not cooked: whole slot (SAFE-03)', () => {
  const meals = [meal({ date: '2026-11-14', mealSlotId: 3, courseId: 1, state: 'skipped' }), meal({ date: '2026-11-14', mealSlotId: 3, courseId: 2, state: 'skipped' })]

  it('acts at once and offers Undo; Undo reopens and says the slot is back in To confirm', async () => {
    const api = mockApi({
      ...base, 'POST /api/plan/2026-11-14/3/all/not-cooked': { meals },
      'POST /api/plan/2026-11-14/3/1/reopen': { meals: [], stockGone: 0 },
    })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(within(await dayTile(/^Sat 14/)).getByRole('button', { name: 'Dinner actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Not cooked: whole slot' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    const toast = await findToastWith('Sat Dinner marked Not cooked')
    await pressInToast(toast, 'Undo Not cooked for Sat Dinner')
    expect(await findToastWith('Sat Dinner is back in To confirm')).toBeTruthy()
    expect(api.callsTo('POST', '/api/plan/2026-11-14/3/1/reopen')).toHaveLength(1)
  })
})

describe('PlanScreen: Undo from the Planned Meal sheet of a Cooked meal (SAFE-03)', () => {
  const openCooked = async () => {
    const tile = await dayTile(/^Sat 14/)
    await userEvent.click(within(rowOf(tile, 'Slow cooker beef and barley stew')).getByRole('button', { name: /Slow cooker beef and barley stew/ }))
    return screen.findByRole('dialog', { name: 'Slow cooker beef and barley stew' })
  }

  it('says how it was marked in the Household zone and offers Undo Cooked', async () => {
    mockApi(base)
    renderWithProviders(<PlanScreen />)
    const sheet = await openCooked()
    expect(within(sheet).getByText('Marked Cooked today at 08:40 by Anna. 1.25 portions were kept as a Leftover.')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Undo Cooked' })).toBeInTheDocument()
  })

  it('Undo Cooked reopens the Course, closes the sheet and says it is back in To confirm', async () => {
    const api = mockApi({ ...base, 'POST /api/plan/2026-11-14/1/1/reopen': { meals: [], stockGone: 0 } })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(within(await openCooked()).getByRole('button', { name: 'Undo Cooked' }))
    expect(await findToastWith('Sat Breakfast is back in To confirm')).toBeTruthy()
    expect(api.callsTo('POST', '/api/plan/2026-11-14/1/1/reopen')).toHaveLength(1)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Slow cooker beef and barley stew' })).toBeNull())
  })

  it('a refused Undo Cooked says "Nothing was undone" and the reason', async () => {
    mockApi({ ...base, 'POST /api/plan/2026-11-14/1/1/reopen': { status: 409, json: { error: { code: 'leftover_used', message: 'used' } } } })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(within(await openCooked()).getByRole('button', { name: 'Undo Cooked' }))
    expect(await findToastWith('Nothing was undone')).toHaveTextContent('Some of the Leftover has been used.')
    expect(toastWith('is back in To confirm')).toBeUndefined()
  })
})
