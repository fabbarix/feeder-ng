// B9-26 (SAFE-03): on Today, Not cooked from a To confirm row ⋮ acts at once and offers Undo from a one-line toast (no icon); Cooked in
// one tap shows the rich toast with Undo. 2026-11-10 is a Tuesday.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useQueryClient } from '@tanstack/react-query'
import { createElement, useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { findToast } from '../../../test/notices'
import { courseMeal, mockApi, renderWithProviders, slot } from '../../plan/test-utils'
import type { CookedResult, CookPreview, PlanSlot } from '../../plan/types'
import { TodayScreen } from './TodayScreen'

const h = vi.hoisted(() => ({ toConfirm: [] as unknown[] }))

vi.mock('../seams', () => ({
  useScanSessionActive: () => false,
  useTodayPlan: () => ({ today: '2026-11-10', hasNextMeal: false, toConfirm: h.toConfirm.length, couldntPlan: 0, leftovers: 0, loading: false }),
  useTodayStock: () => ({ spoiled: 0, useSoon: [], loading: false }),
  useTodayTileData: () => ({
    now: new Date('2026-11-10T20:00:00Z'), nextSlot: null, nextDay: 'today', nextAction: 'cook', toConfirm: h.toConfirm, couldntPlan: [], leftovers: [], planToday: '2026-11-10',
    spoiled: [], stockToday: '2026-11-10', system: 'metric', useSoon: [], throwOut: vi.fn(), keep: vi.fn(), planLoading: false, stockLoading: false,
  }),
  ShoppingListSeam: () => createElement('p', null, 'The Shopping List'),
}))

/** The seams are mocked, so the To confirm list the real seam would have cached is put in the query cache here: the toasts name the meal from it. */
function CacheToConfirm() {
  const client = useQueryClient()
  useEffect(() => {
    client.setQueryData(['plan', 'to-confirm'], { slots: h.toConfirm })
  }, [client])
  return null
}
const routed = (
  <>
    <CacheToConfirm />
    <Routes>
      <Route path="/" element={<TodayScreen />} />
    </Routes>
  </>
)
const base = { 'GET /api/today/advance-steps': { steps: [] }, 'GET /api/today/streak': { days: 0 } }
const entry = (): PlanSlot =>
  slot({ date: '2026-11-10', mealSlotId: 2, name: 'Dinner', time: '19:30', courseId: 1, courseName: 'Main', meal: courseMeal(1, 'Main', { date: '2026-11-10', mealSlotId: 2, recipeName: 'Chicken curry' }) })
const preview: CookPreview = { meal: courseMeal(1, 'Main', { recipeName: 'Chicken curry' }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-13', needs: [] }
const cooked: CookedResult = {
  meal: courseMeal(1, 'Main', { state: 'cooked' }), warnings: [],
  leftover: { id: 3, recipeId: 7, recipeName: 'Chicken curry', portions: 2, cookedOn: '2026-11-10', useBy: '2026-11-13', fromDate: '2026-11-10', fromMealSlotId: 2 }, plannedFor: [],
}
const reopen = { meals: [courseMeal(1, 'Main', { state: 'planned' })], stockGone: 0 }

afterEach(() => {
  h.toConfirm = []
  vi.unstubAllGlobals()
})

describe('Today: To confirm and Undo (SAFE-03)', () => {
  it('Not cooked from the ⋮ acts at once, shows "Tue Dinner marked Not cooked" with Undo and no icon; Undo reopens it', async () => {
    h.toConfirm = [entry()]
    const api = mockApi({ ...base, 'POST /api/plan/2026-11-10/2/1/not-cooked': courseMeal(1, 'Main', { state: 'skipped' }), 'POST /api/plan/2026-11-10/2/1/reopen': reopen })
    renderWithProviders(routed, '/')
    await userEvent.click(await screen.findByRole('button', { name: /^More for / }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Not cooked' }))
    expect(screen.queryByRole('alertdialog')).toBeNull() // no confirm: Undo is the safety net
    const toast = await findToast('Tue Dinner marked Not cooked')
    expect(toast.querySelector('.toast__title svg')).toBeNull()
    await userEvent.click(within(toast).getByRole('button', { name: 'Undo Not cooked for Tue Dinner' }))
    expect(await findToast('Tue Dinner is back in To confirm')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/plan/2026-11-10/2/1/reopen')).toHaveLength(1)
  })

  it('Cooked in one tap shows the rich toast, and its Undo reopens the meal', async () => {
    h.toConfirm = [entry()]
    const api = mockApi({ ...base, 'GET /api/plan/2026-11-10/2/1/cook': preview, 'POST /api/plan/2026-11-10/2/1/cooked': cooked, 'POST /api/plan/2026-11-10/2/1/reopen': reopen })
    renderWithProviders(routed, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Cooked' }))
    const toast = await findToast('Cooked, nice one!')
    expect(toast.querySelector('.toast__subline')).toHaveTextContent('Tue Dinner · Chicken curry')
    expect(toast.querySelector('.toast__body')).toHaveTextContent('2 portions kept as a Leftover, good until Fri.')
    await userEvent.click(within(toast).getByRole('button', { name: 'Undo Cooked for Tue Dinner' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/2/1/reopen')).toHaveLength(1))
  })
})
