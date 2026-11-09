import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PlanScreen } from './PlanScreen'
import { meal, mockApi, renderWithProviders, slot } from '../test-utils'
import type { CookedResult, CookPreview, PlanView } from '../types'

const view = (over: Partial<PlanView> = {}): PlanView => ({
  today: '2026-11-09', horizonDays: 3, updating: false,
  slots: [
    slot({ date: '2026-11-09', mealSlotId: 2, meal: meal({ date: '2026-11-09', mealSlotId: 2, recipeId: 7, recipeName: 'Chicken', why: [{ code: 'favourite', members: ['Anna'] }] }) }),
    slot({ date: '2026-11-10', mealSlotId: 3, meal: meal({ date: '2026-11-10', mealSlotId: 3, recipeId: 8, recipeName: 'Stew' }) }),
    slot({
      date: '2026-11-11', mealSlotId: 4, meal: null,
      unfilled: { reason: 'no_candidates', slotRuleClaimed: false, eliminated: { considered: 2, exclusion: 0, coolDown: 2, varietyRule: 0, advanceStep: 0 } },
    }),
  ],
  ...over,
})

const preview: CookPreview = {
  meal: meal({ recipeName: 'Chicken' }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 2, maxLeftover: 4,
  leftoverUseBy: '2026-11-12', needs: [],
}

describe('PlanScreen', () => {
  it('shows a day tile per day, today first, with its meals', async () => {
    mockApi({ 'GET /api/plan': view() })
    renderWithProviders(<PlanScreen />)
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tomorrow' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Wed 11 Nov' })).toBeInTheDocument()
    expect(screen.getByText('Chicken')).toBeInTheDocument()
    expect(screen.getByText("Anna's favourite")).toBeInTheDocument()
    expect(screen.getByText("Couldn't plan Wednesday dinner: every option was in Cool-down.")).toBeInTheDocument()
    const today = screen.getByRole('heading', { name: 'Today' }).closest('[data-size]')
    expect(today).toHaveAttribute('data-size', 'full')
  })

  it('says when the planner is catching up', async () => {
    mockApi({ 'GET /api/plan': view({ updating: true }) })
    renderWithProviders(<PlanScreen />)
    expect(await screen.findByText('Updating the plan…')).toBeInTheDocument()
  })

  it('an empty plan points to Settings and Recipes', async () => {
    mockApi({ 'GET /api/plan': view({ slots: [] }) })
    renderWithProviders(<PlanScreen />)
    expect(await screen.findByText(/Nothing is planned yet/)).toBeInTheDocument()
  })

  it('a failed load says so', async () => {
    mockApi({ 'GET /api/plan': { status: 500, json: { error: { code: 'internal', message: 'x' } } } })
    renderWithProviders(<PlanScreen />)
    expect(await screen.findByRole('alert')).toHaveTextContent('The plan could not be loaded.')
  })

  it('Regenerate posts and reloads the plan', async () => {
    const api = mockApi({ 'GET /api/plan': view(), 'POST /api/plan/regenerate': undefined })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Regenerate' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/regenerate')).toHaveLength(1))
    await waitFor(() => expect(api.callsTo('GET', '/api/plan').length).toBeGreaterThanOrEqual(2))
  })

  it('Swap opens three alternatives and choosing one sets it on the slot', async () => {
    const api = mockApi({
      'GET /api/plan': view(),
      'GET /api/plan/2026-11-10/3/alternatives': {
        alternatives: [
          { recipeId: 21, recipeName: 'Pizza', batches: 1, newLeftoverPortions: 0, newLeftoverUseBy: '', score: 3, why: [{ code: 'best_available' }] },
          { recipeId: 22, recipeName: 'Soup', batches: 1, newLeftoverPortions: 0, newLeftoverUseBy: '', score: 2, why: [{ code: 'best_available' }] },
          { recipeId: 23, recipeName: 'Curry', batches: 1, newLeftoverPortions: 0, newLeftoverUseBy: '', score: 1, why: [{ code: 'best_available' }] },
        ],
      },
      'PUT /api/plan/2026-11-10/3': meal({ recipeId: 21, pinned: true }),
    })
    renderWithProviders(<PlanScreen />)
    const tomorrow = (await screen.findByRole('heading', { name: 'Tomorrow' })).closest('article')!
    await userEvent.click(within(tomorrow as HTMLElement).getByRole('button', { name: 'Swap' }))
    const dialog = await screen.findByRole('dialog', { name: 'Swap this meal' })
    expect(await within(dialog).findAllByRole('button', { name: /^Choose / })).toHaveLength(3)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Choose Pizza' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/plan/2026-11-10/3')[0]?.body).toEqual({ recipeId: 21 }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('an empty slot lets you choose any Recipe', async () => {
    const api = mockApi({
      'GET /api/plan': view(),
      'GET /api/recipes': [{ id: 31, name: 'Omelette' }, { id: 32, name: 'Risotto' }],
      'PUT /api/plan/2026-11-11/4': meal({ recipeId: 32, pinned: true }),
    })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Choose a Recipe' }))
    const dialog = await screen.findByRole('dialog', { name: 'Choose a Recipe' })
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Risotto' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/plan/2026-11-11/4')[0]?.body).toEqual({ recipeId: 32 }))
  })

  it('Mark as Cooked: edit the Leftover, confirm, then correct a Stock shortfall in one tap', async () => {
    const cooked: CookedResult = {
      meal: meal({ state: 'cooked' }), leftover: null,
      warnings: [{ ingredientId: 11, name: 'chicken thighs', baseUnit: 'g', have: 300, need: 400, shortfall: 100, message: 'Stock shows only 300 g chicken thighs, the recipe uses 400 g' }],
    }
    const api = mockApi({
      'GET /api/plan': view(),
      'GET /api/plan/2026-11-09/2/cook': preview,
      'POST /api/plan/2026-11-09/2/cooked': cooked,
      'PUT /api/stock/ingredients/11/total': { ingredient: {}, lots: [] },
    })
    renderWithProviders(<PlanScreen />)
    const today = (await screen.findByRole('heading', { name: 'Today' })).closest('article')!
    await userEvent.click(within(today as HTMLElement).getByRole('button', { name: 'Mark as Cooked' }))
    const sheet = await screen.findByRole('dialog', { name: 'Mark as Cooked' })
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Increase Leftover portions' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Mark as Cooked' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-09/2/cooked')[0]?.body).toEqual({ leftoverPortions: 2.5 }))

    const notice = await screen.findByRole('alert')
    expect(notice).toHaveTextContent('Stock shows only 300 g chicken thighs, the recipe uses 400 g')
    await userEvent.click(within(notice).getByRole('button', { name: 'Correct Stock' }))
    const correct = await screen.findByRole('dialog', { name: 'How much chicken thighs do you have?' })
    const input = within(correct).getByLabelText('Total in Stock')
    await userEvent.clear(input)
    await userEvent.type(input, '250')
    await userEvent.click(within(correct).getByRole('button', { name: 'Set total' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/stock/ingredients/11/total')[0]?.body).toEqual({ total: 250 }))
  })

  it('dismissing the shortfall leaves Stock alone', async () => {
    const cooked: CookedResult = {
      meal: meal({ state: 'cooked' }), leftover: null,
      warnings: [{ ingredientId: 11, name: 'chicken thighs', baseUnit: 'g', have: 300, need: 400, shortfall: 100, message: 'Stock shows only 300 g chicken thighs, the recipe uses 400 g' }],
    }
    const api = mockApi({ 'GET /api/plan': view(), 'GET /api/plan/2026-11-09/2/cook': preview, 'POST /api/plan/2026-11-09/2/cooked': cooked })
    renderWithProviders(<PlanScreen />)
    const today = (await screen.findByRole('heading', { name: 'Today' })).closest('article')!
    await userEvent.click(within(today as HTMLElement).getByRole('button', { name: 'Mark as Cooked' }))
    const sheet = await screen.findByRole('dialog', { name: 'Mark as Cooked' })
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Mark as Cooked' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(api.calls.some((c) => c.path.startsWith('/api/stock'))).toBe(false)
  })

  it('Not cooked from the sheet posts to not-cooked', async () => {
    const api = mockApi({
      'GET /api/plan': view(), 'GET /api/plan/2026-11-09/2/cook': preview,
      'POST /api/plan/2026-11-09/2/not-cooked': meal({ state: 'skipped' }),
    })
    renderWithProviders(<PlanScreen />)
    const today = (await screen.findByRole('heading', { name: 'Today' })).closest('article')!
    await userEvent.click(within(today as HTMLElement).getByRole('button', { name: 'Mark as Cooked' }))
    const sheet = await screen.findByRole('dialog', { name: 'Mark as Cooked' })
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Not cooked' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-09/2/not-cooked')).toHaveLength(1))
  })

  it('Confirm and Unpin call their routes', async () => {
    const api = mockApi({
      'GET /api/plan': view(),
      'POST /api/plan/2026-11-10/3/confirm': meal({ pinned: true }),
    })
    renderWithProviders(<PlanScreen />)
    const tomorrow = (await screen.findByRole('heading', { name: 'Tomorrow' })).closest('article')!
    await userEvent.click(within(tomorrow as HTMLElement).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/3/confirm')).toHaveLength(1))
  })
})
