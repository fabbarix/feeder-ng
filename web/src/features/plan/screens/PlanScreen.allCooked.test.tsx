// CRS F review (spec 8): Mark all Cooked on the Plan shows the outcome the single path shows: the success toast and the
// Stock shortfall notices with Correct Stock and Dismiss.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlanScreen } from './PlanScreen'
import { findNotice, noticeWith } from '../../../test/notices'
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

describe('PlanScreen: Mark all Cooked outcome', () => {
  it('cheers and says where each Leftover went (a success toast, as for one Course)', async () => {
    await markAll()
    expect(await screen.findByText('Cooked, nice one! Roast chicken: 2 portions → Thu Lunch; Green beans: 1 portion kept, good until Fri')).toBeInTheDocument()
  })

  it('one Leftover reads exactly as the single path does', async () => {
    const one = allCookedResult()
    await markAll({ ...one, leftovers: [one.leftovers[0]!], warnings: [] })
    expect(await screen.findByText('Cooked, nice one! 2 portions → Thu Lunch')).toBeInTheDocument()
  })

  it('no Leftover: just the cheer', async () => {
    await markAll(allCookedResult({ leftovers: [], plannedFor: [], warnings: [] }))
    expect(await screen.findByText('Cooked, nice one!')).toBeInTheDocument()
  })

  it('the sheet closes and the Stock shortfall shows with Correct Stock, which saves the total', async () => {
    const api = await markAll()
    const notice = await findNotice('alert', 'Stock shows only 300 g chicken thighs')
    expect(notice).toHaveTextContent('Stock shows only 300 g chicken thighs, the recipe uses 400 g')
    expect(screen.queryByRole('dialog', { name: 'Mark all Cooked' })).not.toBeInTheDocument()
    await userEvent.click(within(notice).getByRole('button', { name: 'Correct Stock' }))
    const correct = await screen.findByRole('dialog', { name: 'How much chicken thighs do you have?' })
    const input = within(correct).getByRole('spinbutton', { name: 'Total in Stock' })
    await userEvent.clear(input)
    await userEvent.type(input, '250')
    await userEvent.click(within(correct).getByRole('button', { name: 'Set total' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/stock/ingredients/11/total')[0]?.body).toEqual({ total: 250 }))
    await waitFor(() => expect(noticeWith('alert', 'Stock shows only 300 g chicken thighs')).toBeUndefined())
  })

  it('Dismiss removes the shortfall and leaves Stock alone', async () => {
    const api = await markAll()
    await userEvent.click(within(await findNotice('alert', 'Stock shows only 300 g chicken thighs')).getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(noticeWith('alert', 'Stock shows only 300 g chicken thighs')).toBeUndefined())
    expect(api.callsTo('PUT', '/api/stock/ingredients/11/total')).toHaveLength(0)
  })
})
