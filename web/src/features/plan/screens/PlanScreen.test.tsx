import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlanScreen } from './PlanScreen'
import { meal, mockApi, renderWithProviders, slot } from '../test-utils'
import type { CookedResult, CookPreview, PlanView } from '../types'
import { noticeWith, findNotice } from '../../../test/notices'

afterEach(() => vi.unstubAllGlobals())

const view = (over: Partial<PlanView> = {}): PlanView => ({
  today: '2026-11-09', horizonDays: 3, updating: false,
  slots: [
    slot({ date: '2026-11-09', mealSlotId: 2, meal: meal({ date: '2026-11-09', mealSlotId: 2, recipeId: 7, recipeName: 'Chicken', why: [{ code: 'favourite', members: ['Anna'] }, { code: 'best_available' }] }) }),
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

const phone = () =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }))
const widthStub = (width: number) =>
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    return { matches: min ? width >= Number(min[1]) : false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }
  })

const tile = async (name: string) => ((await screen.findByRole('heading', { name })).closest('article') as HTMLElement)
const openSheet = async (day: string, recipe: string) => {
  await userEvent.click(within(await tile(day)).getByRole('button', { name: new RegExp(recipe) }))
  return screen.findByRole('dialog', { name: recipe })
}

describe('PlanScreen layout (5.2)', () => {
  it('has the Plan title, the week range and a secondary Regenerate with its icon', async () => {
    mockApi({ 'GET /api/plan': view() })
    renderWithProviders(<PlanScreen />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Plan' })).toBeInTheDocument()
    expect(screen.getByText('9 – 11 Nov')).toBeInTheDocument()
    const regenerate = screen.getByRole('button', { name: 'Regenerate' })
    expect(regenerate).toHaveAttribute('data-variant', 'secondary')
    expect(regenerate.querySelector('svg')).not.toBeNull()
  })

  it('on a phone (2 columns) shows a day tile per day, today first and spanning two columns', async () => {
    phone()
    mockApi({ 'GET /api/plan': view() })
    renderWithProviders(<PlanScreen />)
    const today = await tile('Today')
    expect(today).toHaveAttribute('data-span', '2')
    expect(screen.getByRole('heading', { name: 'Tomorrow' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Wednesday' })).toBeInTheDocument()
    expect(within(today).getByText('Chicken')).toBeInTheDocument()
    expect(within(await tile('Wednesday')).getByText('Not planned')).toBeInTheDocument() // R13: a chip, not a sentence per slot
  })

  it('at most one chip per Planned Meal on a day tile, and never "best available"', async () => {
    mockApi({ 'GET /api/plan': view() })
    renderWithProviders(<PlanScreen />)
    const today = await tile('Today')
    expect(today.querySelectorAll('.chip')).toHaveLength(1)
    expect(within(today).getByText("Anna's favourite")).toBeInTheDocument()
    expect(screen.queryByText('best available')).not.toBeInTheDocument()
  })

  it.each([
    [390, '2'],
    [820, '4'],
    [1280, '7'],
  ])('at %ipx the week grid has %s columns', async (width, columns) => {
    widthStub(width)
    mockApi({ 'GET /api/plan': view() })
    renderWithProviders(<PlanScreen />)
    await tile('Today')
    expect(screen.getByRole('group', { name: 'Plan' })).toHaveAttribute('data-columns', columns)
  })

  it('at 1280px (7 columns) today takes one column, keeps its ring, and weekday headings are short', async () => {
    widthStub(1280)
    mockApi({ 'GET /api/plan': view() })
    renderWithProviders(<PlanScreen />)
    const today = await tile('Today')
    expect(today).toHaveAttribute('data-span', '1')
    expect(today).toHaveAttribute('data-today', 'true')
    expect(screen.getByRole('heading', { name: 'Wed' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Wednesday' })).not.toBeInTheDocument()
  })

  it('at 1280px (7 columns) a day tile is compact: Recipe name on its own line, ONE action (Cook today, Swap otherwise)', async () => {
    widthStub(1280)
    mockApi({ 'GET /api/plan': view() })
    renderWithProviders(<PlanScreen />)
    const today = await tile('Today')
    expect(today.querySelectorAll('.plan-meal__actions button')).toHaveLength(1)
    expect(within(today).getByRole('button', { name: 'Cook' })).toBeInTheDocument()
    expect(within(today).queryByRole('button', { name: 'Swap' })).not.toBeInTheDocument()
    const tomorrow = await tile('Tomorrow')
    expect(within(tomorrow).getByRole('button', { name: 'Swap' })).toBeInTheDocument()
    expect(within(tomorrow).queryByRole('button', { name: 'Cook' })).not.toBeInTheDocument()
  })

  it('at 1280px the Planned Meal sheet still offers Swap on today (the action the tile gave up)', async () => {
    widthStub(1280)
    mockApi({ 'GET /api/plan': view() })
    renderWithProviders(<PlanScreen />)
    const sheet = await openSheet('Today', 'Chicken')
    expect(within(sheet).getByRole('button', { name: 'Swap' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Cook' })).toBeInTheDocument()
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
    expect(await findNotice('alert', 'The plan could not be loaded.')).toHaveTextContent('The plan could not be loaded.')
  })
})

describe('PlanScreen: Regenerate asks first (2.4)', () => {
  it('states how many unpinned Planned Meals will change, and does nothing on Cancel', async () => {
    phone()
    const api = mockApi({ 'GET /api/plan': view(), 'POST /api/plan/regenerate': undefined })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Regenerate' }))
    const dialog = await screen.findByRole('dialog', { name: 'Regenerate the plan?' })
    expect(dialog).toHaveTextContent('2 unpinned Planned Meals will change. Pinned and Cooked ones stay as they are.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Regenerate the plan?' })).not.toBeInTheDocument())
    expect(api.callsTo('POST', '/api/plan/regenerate')).toHaveLength(0)
  })

  it('posts and reloads the plan once confirmed', async () => {
    const api = mockApi({ 'GET /api/plan': view(), 'POST /api/plan/regenerate': undefined })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Regenerate' }))
    const dialog = await screen.findByRole('dialog', { name: 'Regenerate the plan?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Regenerate' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/regenerate')).toHaveLength(1))
    await waitFor(() => expect(api.callsTo('GET', '/api/plan').length).toBeGreaterThanOrEqual(2))
  })
})

describe('PlanScreen: the Planned Meal sheet', () => {
  it("B10: Mark as Cooked is offered for today's meal only, not for tomorrow's", async () => {
    mockApi({ 'GET /api/plan': view() })
    renderWithProviders(<PlanScreen />)
    const sheet = await openSheet('Today', 'Chicken')
    expect(within(sheet).getByRole('button', { name: 'Mark as Cooked' })).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const tomorrow = await openSheet('Tomorrow', 'Stew')
    expect(within(tomorrow).queryByRole('button', { name: 'Mark as Cooked' })).not.toBeInTheDocument()
    expect(within(tomorrow).queryByRole('button', { name: 'Cook' })).not.toBeInTheDocument()
    expect(within(tomorrow).getByRole('button', { name: 'Swap' })).toBeInTheDocument()
  })

  it('Pin posts to the confirm route (the word is Pin, the route is old)', async () => {
    const api = mockApi({ 'GET /api/plan': view(), 'POST /api/plan/2026-11-10/3/confirm': meal({ pinned: true }) })
    renderWithProviders(<PlanScreen />)
    const sheet = await openSheet('Tomorrow', 'Stew')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Pin' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/3/confirm')).toHaveLength(1))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('Unpin calls its route', async () => {
    const pinned = view()
    pinned.slots[1] = slot({ date: '2026-11-10', mealSlotId: 3, meal: meal({ date: '2026-11-10', mealSlotId: 3, recipeName: 'Stew', pinned: true }) })
    const api = mockApi({ 'GET /api/plan': pinned, 'POST /api/plan/2026-11-10/3/unpin': meal() })
    renderWithProviders(<PlanScreen />)
    const sheet = await openSheet('Tomorrow', 'Stew')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Unpin' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/3/unpin')).toHaveLength(1))
  })
})

describe('PlanScreen: B2 Cook Mode from a Planned Meal', () => {
  const routed = (
    <Routes>
      <Route path="/plan" element={<PlanScreen />} />
      <Route path="/cook/meal/:date/:slotId" element={<p>Cook Mode screen</p>} />
    </Routes>
  )

  it("the Cook icon on today's tile opens Cook Mode for that slot", async () => {
    mockApi({ 'GET /api/plan': view() })
    renderWithProviders(routed, '/plan')
    await userEvent.click(within(await tile('Today')).getByRole('button', { name: 'Cook' }))
    expect(await screen.findByText('Cook Mode screen')).toBeInTheDocument()
  })

  it('so does Cook in the Planned Meal sheet', async () => {
    mockApi({ 'GET /api/plan': view() })
    renderWithProviders(routed, '/plan')
    const sheet = await openSheet('Today', 'Chicken')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cook' }))
    expect(await screen.findByText('Cook Mode screen')).toBeInTheDocument()
  })

  it("tomorrow's tile has no Cook icon", async () => {
    mockApi({ 'GET /api/plan': view() })
    renderWithProviders(routed, '/plan')
    expect(within(await tile('Tomorrow')).queryByRole('button', { name: 'Cook' })).not.toBeInTheDocument()
  })
})

describe('PlanScreen: Swap', () => {
  const alternatives = {
    alternatives: [
      { recipeId: 21, recipeName: 'Pizza', batches: 1, newLeftoverPortions: 0, newLeftoverUseBy: '', score: 3, why: [{ code: 'best_available' }] },
      { recipeId: 22, recipeName: 'Soup', batches: 1, newLeftoverPortions: 0, newLeftoverUseBy: '', score: 2, why: [] },
      { recipeId: 23, recipeName: 'Curry', batches: 1, newLeftoverPortions: 0, newLeftoverUseBy: '', score: 1, why: [] },
    ],
  }

  it('the icon button opens three alternative rows and tapping one sets it on the slot', async () => {
    const api = mockApi({ 'GET /api/plan': view(), 'GET /api/plan/2026-11-10/3/alternatives': alternatives, 'PUT /api/plan/2026-11-10/3': meal({ recipeId: 21, pinned: true }) })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(within(await tile('Tomorrow')).getByRole('button', { name: 'Swap' }))
    const dialog = await screen.findByRole('dialog', { name: 'Swap for…' })
    expect(await within(dialog).findByRole('button', { name: 'Pizza' })).toBeInTheDocument()
    expect(within(dialog).getByRole('list', { name: 'Alternatives' }).querySelectorAll('li')).toHaveLength(3)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pizza' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/plan/2026-11-10/3')[0]?.body).toEqual({ recipeId: 21 }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('toasts "Swapped" with Undo, which puts the previous Recipe back and unpins it', async () => {
    const api = mockApi({
      'GET /api/plan': view(), 'GET /api/plan/2026-11-10/3/alternatives': alternatives,
      'PUT /api/plan/2026-11-10/3': meal({ recipeId: 21, pinned: true }),
      'POST /api/plan/2026-11-10/3/unpin': meal({ recipeId: 8 }),
    })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(within(await tile('Tomorrow')).getByRole('button', { name: 'Swap' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Pizza' }))
    const toast = await findNotice('status', 'Swapped')
    await userEvent.click(within(toast).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/plan/2026-11-10/3')).toHaveLength(2))
    expect(api.callsTo('PUT', '/api/plan/2026-11-10/3')[1]?.body).toEqual({ recipeId: 8 })
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/3/unpin')).toHaveLength(1))
  })

  it('"Keep it" closes the sheet and changes nothing', async () => {
    const api = mockApi({ 'GET /api/plan': view(), 'GET /api/plan/2026-11-10/3/alternatives': alternatives })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(within(await tile('Tomorrow')).getByRole('button', { name: 'Swap' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Keep it' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.calls.some((c) => c.method !== 'GET')).toBe(false)
  })
})

describe('PlanScreen: choose a Recipe and Mark as Cooked', () => {
  it('an empty slot lets you choose any Recipe from a searchable list', async () => {
    const api = mockApi({
      'GET /api/plan': view(),
      'GET /api/recipes': [{ id: 31, name: 'Omelette', tags: [] }, { id: 32, name: 'Risotto', tags: [] }],
      'PUT /api/plan/2026-11-11/4': meal({ recipeId: 32, pinned: true }),
    })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Choose a Recipe' }))
    const dialog = await screen.findByRole('dialog', { name: 'Choose a Recipe' })
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Risotto' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/plan/2026-11-11/4')[0]?.body).toEqual({ recipeId: 32 }))
  })

  it('Mark as Cooked from the sheet: edit the Leftover, confirm, then correct a Stock shortfall in one tap', async () => {
    const cooked: CookedResult = {
      meal: meal({ state: 'cooked' }), leftover: null, plannedFor: [],
      warnings: [{ ingredientId: 11, name: 'chicken thighs', baseUnit: 'g', have: 300, need: 400, shortfall: 100, message: 'Stock shows only 300 g chicken thighs, the recipe uses 400 g' }],
    }
    const api = mockApi({
      'GET /api/plan': view(),
      'GET /api/plan/2026-11-09/2/cook': preview,
      'POST /api/plan/2026-11-09/2/cooked': cooked,
      'PUT /api/stock/ingredients/11/total': { ingredient: {}, lots: [] },
    })
    renderWithProviders(<PlanScreen />)
    const planned = await openSheet('Today', 'Chicken')
    await userEvent.click(within(planned).getByRole('button', { name: 'Mark as Cooked' }))
    const sheet = await screen.findByRole('dialog', { name: 'Mark as Cooked' })
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Increase Leftover portions' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Mark as Cooked' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-09/2/cooked')[0]?.body).toEqual({ leftoverPortions: 2.5 }))

    const notice = await findNotice('alert', 'Stock shows only 300 g chicken thighs')
    await userEvent.click(within(notice).getByRole('button', { name: 'Correct Stock' }))
    const correct = await screen.findByRole('dialog', { name: 'How much chicken thighs do you have?' })
    const input = within(correct).getByRole('spinbutton', { name: 'Total in Stock' })
    await userEvent.clear(input)
    await userEvent.type(input, '250')
    await userEvent.click(within(correct).getByRole('button', { name: 'Set total' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/stock/ingredients/11/total')[0]?.body).toEqual({ total: 250 }))
  })

  it('dismissing the shortfall leaves Stock alone', async () => {
    const cooked: CookedResult = {
      meal: meal({ state: 'cooked' }), leftover: null, plannedFor: [],
      warnings: [{ ingredientId: 11, name: 'chicken thighs', baseUnit: 'g', have: 300, need: 400, shortfall: 100, message: 'Stock shows only 300 g chicken thighs, the recipe uses 400 g' }],
    }
    const api = mockApi({ 'GET /api/plan': view(), 'GET /api/plan/2026-11-09/2/cook': preview, 'POST /api/plan/2026-11-09/2/cooked': cooked })
    renderWithProviders(<PlanScreen />)
    const planned = await openSheet('Today', 'Chicken')
    await userEvent.click(within(planned).getByRole('button', { name: 'Mark as Cooked' }))
    const sheet = await screen.findByRole('dialog', { name: 'Mark as Cooked' })
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Mark as Cooked' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(noticeWith('alert', 'Stock shows only 300 g chicken thighs')).toBeUndefined())
    expect(api.calls.some((c) => c.path.startsWith('/api/stock'))).toBe(false)
  })

  it('Not cooked from the sheet posts to not-cooked', async () => {
    const api = mockApi({
      'GET /api/plan': view(), 'GET /api/plan/2026-11-09/2/cook': preview,
      'POST /api/plan/2026-11-09/2/not-cooked': meal({ state: 'skipped' }),
    })
    renderWithProviders(<PlanScreen />)
    const planned = await openSheet('Today', 'Chicken')
    await userEvent.click(within(planned).getByRole('button', { name: 'Mark as Cooked' }))
    const sheet = await screen.findByRole('dialog', { name: 'Mark as Cooked' })
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Not cooked' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-09/2/not-cooked')).toHaveLength(1))
  })
})
