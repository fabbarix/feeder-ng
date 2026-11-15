// CRS F review (spec 8): Mark all Cooked on the Plan shows the outcome the single path shows: the success toast and the
// Stock shortfall notices with Correct Stock and Dismiss.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlanScreen } from './PlanScreen'
import { findToast } from '../../../test/notices'
import { allCookedResult, courseMeal, courseSlot, mockApi, planCourse, renderWithProviders } from '../test-utils'
import type { CookedAllResult, CookPreview, PlanView } from '../types'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))
afterEach(() => vi.unstubAllGlobals())

const TODAY = '2026-11-10'
const dinner = () =>
  courseSlot(
    [
      planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { mealSlotId: 4, recipeId: 7, recipeName: 'Roast chicken', portions: 4 }) }),
      planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { mealSlotId: 4, recipeId: 8, recipeName: 'Green beans', portions: 3 }) }),
    ],
    { date: TODAY, mealSlotId: 4, name: 'Dinner', time: '19:00', at: `${TODAY}T19:00:00Z` },
  )
const view = (): PlanView => ({ today: TODAY, horizonDays: 3, updating: false, slots: [dinner()] })
const preview = (courseId: number, courseName: string, recipeName: string): CookPreview => ({
  meal: courseMeal(courseId, courseName, { recipeName, mealSlotId: 4 }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 2, maxLeftover: 4,
  leftoverUseBy: '2026-11-13', needs: [],
})

async function markAll(result: CookedAllResult = allCookedResult()) {
  const api = mockApi({
    'GET /api/plan': view(),
    'GET /api/plan/2026-11-10/4/1/cook': preview(1, 'Main', 'Roast chicken'),
    'GET /api/plan/2026-11-10/4/2/cook': preview(2, 'Side', 'Green beans'),
    'POST /api/plan/2026-11-10/4/all/cooked': result,
    'PUT /api/stock/ingredients/11/total': { ingredient: {}, lots: [] },
  })
  renderWithProviders(<PlanScreen />)
  await userEvent.click(await screen.findByRole('button', { name: 'Dinner actions' }))
  await userEvent.click(screen.getByRole('menuitem', { name: 'Mark all Cooked' }))
  const sheet = await screen.findByRole('dialog', { name: 'Mark all Cooked' })
  await within(sheet).findByRole('spinbutton', { name: 'Side Leftover portions' })
  await userEvent.click(within(sheet).getByRole('button', { name: 'Mark all Cooked' }))
  await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/4/all/cooked')).toHaveLength(1))
  return api
}

/** B9-45 (PC-02): the ONE shortfall notice (an info status tile with DetailList rows), not one danger alert per warning. */
const findShortfallNotice = () =>
  waitFor(() => {
    const el = document.querySelector<HTMLElement>('.shortfall-notice')
    if (!el) throw new Error('no shortfall notice')
    return el
  })

describe('PlanScreen: Mark all Cooked outcome', () => {
  it('cheers and says where each Leftover went (a success toast, as for one Course)', async () => {
    await markAll()
    // B9-26: the rich toast: headline, the slot, each Leftover by its Recipe, and one Undo for all the Courses.
    const toast = await findToast('Cooked, nice one!')
    expect(toast.querySelector('.toast__body')).toHaveTextContent('Roast chicken: 2 portions planned for Thu Lunch. Green beans: 1 portion kept as a Leftover, good until Fri.')
  })

  it('one Leftover reads exactly as the single path does', async () => {
    const one = allCookedResult()
    await markAll({ ...one, leftovers: [one.leftovers[0]!], warnings: [] })
    expect((await findToast('Cooked, nice one!')).querySelector('.toast__body')).toHaveTextContent(/^2 portions planned for Thu Lunch\.$/)
  })

  it('no Leftover: just the cheer', async () => {
    await markAll(allCookedResult({ leftovers: [], plannedFor: [], warnings: [] }))
    expect(await screen.findByText('Cooked, nice one!')).toBeInTheDocument()
  })

  it('the sheet closes and ONE shortfall notice shows with Correct Stock, which saves the raised totals', async () => {
    const api = await markAll()
    const notice = await findShortfallNotice()
    expect(notice).toHaveTextContent('Stock was short for chicken thighs')
    expect(notice).toHaveTextContent('Cooking used 400 g · Stock showed 300 g')
    expect(screen.queryByRole('dialog', { name: 'Mark all Cooked' })).not.toBeInTheDocument()
    await userEvent.click(within(notice).getByRole('button', { name: 'Correct Stock' }))
    const correct = await screen.findByRole('dialog', { name: /Correct Stock/ })
    await userEvent.click(within(within(correct).getByRole('group', { name: 'chicken thighs left now' })).getByRole('button', { name: /^Increase/ }))
    await userEvent.click(within(correct).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/stock/ingredients/11/total')[0]?.body).toEqual({ total: 10 }))
    await waitFor(() => expect(document.querySelector('.shortfall-notice')).toBeNull())
  })

  it('Dismiss removes the shortfall and leaves Stock alone', async () => {
    const api = await markAll()
    await userEvent.click(within(await findShortfallNotice()).getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(document.querySelector('.shortfall-notice')).toBeNull())
    expect(api.callsTo('PUT', '/api/stock/ingredients/11/total')).toHaveLength(0)
  })
})
