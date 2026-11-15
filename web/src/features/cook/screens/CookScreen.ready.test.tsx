// B9-45 (PC-05, decision PC 6): Cook Mode opens on a "Get ready" tile with the Ingredient list scaled to the planned portions.
//   Scenario: Cook Mode shows the Ingredients for the planned portions before the first Step.
//   Scenario: I can see the Ingredients while cooking.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { courseMeal, mockApi, renderWithProviders, slot } from '../../plan/test-utils'
import { stubViewportWidth } from '../../../ui/lib/viewport.test-helper'
import { saveResume } from '../lib/resume'
import { oneCourseTimeline, timelineView } from '../timeline-fixtures'
import type { CookView } from '../types'
import { CookScreen } from './CookScreen'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))

const steps = (n: number): CookView['steps'] =>
  Array.from({ length: n }, (_, i) => ({
    index: i, number: i + 1, of: n, kind: 'active' as const, text: i === 0 ? 'Roast the chicken' : 'Rest and carve', durationMinutes: 10, imageUrl: '', uses: [], timer: null,
  }))
const mealView: CookView = {
  scope: 'meal:2026-11-09/2', recipeId: 7, recipeName: 'Roast chicken', batches: 1, meal: { date: '2026-11-09', mealSlotId: 2 }, today: '2026-11-09', advance: [],
  steps: steps(2), timers: [],
}
const recipeView: CookView = { ...mealView, scope: 'recipe:7', meal: null }
const line = (ingredientId: number, ingredient: string, quantity: number, unit: string, optional = false) => ({ ingredientId, ingredient, quantity, unit, optional, note: '' })
const recipe = {
  id: 7, name: 'Roast chicken', yield: 4,
  lines: [line(1, 'Chicken', 1200, 'g'), line(2, 'Rice', 300, 'g'), line(3, 'Garlic', 20, 'g'), line(4, 'Lemons', 2, ''), line(5, 'Olive oil', 1, 'tbsp', true)],
}
const stockLots = {
  today: '2026-11-09',
  lots: [
    { id: 1, ingredientId: 1, quantity: 1500, goesOff: '2026-11-12', spoiled: false, storagePlaceId: 2 },
    { id: 2, ingredientId: 2, quantity: 900, goesOff: null, spoiled: false, storagePlaceId: 1 },
    { id: 3, ingredientId: 3, quantity: 90, goesOff: null, spoiled: false, storagePlaceId: 1 },
    { id: 4, ingredientId: 4, quantity: 4, goesOff: '2026-11-14', spoiled: false, storagePlaceId: 3 },
    { id: 5, ingredientId: 5, quantity: 500, goesOff: null, spoiled: false, storagePlaceId: 1 },
  ],
}
const places = [
  { id: 1, name: 'Pantry', kind: 'pantry', default: true },
  { id: 2, name: 'Fridge', kind: 'fridge', default: false },
  { id: 3, name: 'Fruit bowl', kind: 'pantry', default: false },
]
const plan = {
  today: '2026-11-09', horizonDays: 3, updating: false,
  slots: [slot({ date: '2026-11-09', mealSlotId: 2, meal: courseMeal(1, 'Main', { date: '2026-11-09', mealSlotId: 2, recipeId: 7, recipeName: 'Roast chicken', portions: 2.75, batches: 1 }) })],
}
const routes = (extra: Record<string, unknown> = {}) => ({
  'GET /api/cook/meals/2026-11-09/2/all': oneCourseTimeline(mealView),
  'GET /api/plan': plan,
  'GET /api/cook/timers': { now: '2026-11-09T12:00:00Z', timers: [] },
  'GET /api/recipes/7': recipe,
  'GET /api/stock/lots': stockLots,
  'GET /api/storage-places': places,
  ...extra,
})
const renderMeal = () =>
  renderWithProviders(
    <Routes>
      <Route path="/cook/meal/:date/:slotId" element={<CookScreen />} />
      <Route path="/cook/recipe/:id" element={<CookScreen />} />
    </Routes>,
    '/cook/meal/2026-11-09/2',
  )
const renderRecipe = (batches = 1) =>
  renderWithProviders(
    <Routes>
      <Route path="/cook/recipe/:id" element={<CookScreen />} />
    </Routes>,
    `/cook/recipe/7?batches=${batches}`,
  )
const getReady = () => screen.findByRole('article', { name: 'Get ready' })

beforeEach(() => {
  localStorage.clear()
  stubViewportWidth(390)
})
afterEach(() => vi.unstubAllGlobals())

describe('Cook Mode opens on Get ready', () => {
  it('shows the Ingredients at the planned portions before the first Step, with where each is kept and the amount', async () => {
    mockApi(routes())
    renderMeal()
    const tile = await getReady()
    expect(within(tile).getByText('For 2.75 portions: 1 Batch of 4 portions, 1.25 kept as a Leftover')).toBeInTheDocument()
    const rows = [...tile.querySelectorAll('li.list-row')].map((r) => [r.querySelector('.list-row__title')?.textContent, r.querySelector('.list-row__meta')?.textContent ?? null, r.querySelector('.list-row__value')?.textContent])
    expect(rows).toEqual([
      ['Chicken', 'Fridge', '1.2 kg'],
      ['Rice', 'Pantry', '300 g'],
      ['Garlic', 'Pantry', '20 g'],
      ['Lemons', 'Fruit bowl', '2'],
      ['Olive oil', 'Pantry · optional', '1 tbsp'],
    ])
    expect(screen.getByRole('heading', { level: 1, name: 'Roast chicken' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: /^Step 1 of/ })).not.toBeInTheDocument()
  })

  it('waits for the list instead of flashing Step 1 first', async () => {
    mockApi(routes())
    renderMeal()
    await getReady()
    expect(screen.queryByRole('article', { name: /^Step / })).not.toBeInTheDocument()
  })

  it('has Back disabled and Next reading "Start cooking", and no Ingredients button (the list is on screen)', async () => {
    mockApi(routes())
    renderMeal()
    await getReady()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Start cooking' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ingredients' })).not.toBeInTheDocument()
  })

  it('Start cooking moves to Step 1 and puts focus on it; Back stays disabled there', async () => {
    mockApi(routes())
    renderMeal()
    await getReady()
    await userEvent.click(screen.getByRole('button', { name: 'Start cooking' }))
    const step = await screen.findByRole('article', { name: 'Step 1 of 2' })
    expect(screen.queryByRole('article', { name: 'Get ready' })).not.toBeInTheDocument()
    await waitFor(() => expect(step.contains(document.activeElement)).toBe(true))
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
  })

  it('ticking a row mutes it and changes no Stock (only reads go to the API)', async () => {
    const api = mockApi(routes())
    renderMeal()
    const tile = await getReady()
    await userEvent.click(within(tile).getByRole('checkbox', { name: 'Chicken, 1.2 kg' }))
    expect(within(tile).getByRole('checkbox', { name: 'Chicken, 1.2 kg' })).toBeChecked()
    expect(tile.querySelectorAll('li.list-row[data-ticked="true"]')).toHaveLength(1)
    expect(api.calls.filter((c) => c.method !== 'GET')).toEqual([])
  })

  it('opens on Step 1 as before when the Recipe cannot be read', async () => {
    mockApi(routes({ 'GET /api/recipes/7': { status: 500, json: { error: { code: 'x', message: 'no' } } } }))
    renderMeal()
    expect(await screen.findByRole('article', { name: 'Step 1 of 2' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Get ready' })).not.toBeInTheDocument()
  })

  it('groups a timeline of several Courses under a subheader per Course', async () => {
    const tl = timelineView({ date: '2026-11-09', mealSlotId: 2 })
    mockApi(
      routes({
        'GET /api/cook/meals/2026-11-09/2/all': tl,
        'GET /api/recipes/8': { id: 8, name: 'Green beans', yield: 4, lines: [line(9, 'Beans', 400, 'g')] },
      }),
    )
    renderMeal()
    const tile = await getReady()
    expect(within(tile).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Main · Roast chicken', 'Side · Green beans'])
  })
})

describe('the Ingredients while cooking', () => {
  it('the Ingredients button opens the same list in a sheet with the R-B Close, and the ticks are the same', async () => {
    mockApi(routes())
    renderMeal()
    const tile = await getReady()
    await userEvent.click(within(tile).getByRole('checkbox', { name: 'Rice, 300 g' }))
    await userEvent.click(screen.getByRole('button', { name: 'Start cooking' }))
    await screen.findByRole('article', { name: 'Step 1 of 2' })
    await userEvent.click(screen.getByRole('button', { name: 'Ingredients' }))
    const sheet = await screen.findByRole('dialog', { name: /Ingredients/ })
    expect(within(sheet).getByText('Roast chicken · 2.75 portions')).toBeInTheDocument()
    expect(within(sheet).getByRole('checkbox', { name: 'Rice, 300 g' })).toBeChecked()
    expect(within(sheet).getByRole('checkbox', { name: 'Chicken, 1.2 kg' })).not.toBeChecked()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Ingredients/ })).not.toBeInTheDocument())
    expect(screen.getByRole('article', { name: 'Step 1 of 2' })).toBeInTheDocument()
  })

  it('from 1024 px the list sits in the rail beside the timers, not in a sheet', async () => {
    stubViewportWidth(1280)
    const running = { id: 1, scope: 'meal:2026-11-09/2', step: 0, label: 'Roast', durationSeconds: 600, state: 'running', remainingSeconds: 600, endsAt: '2026-11-09T12:10:00Z', startedAt: '2026-11-09T12:00:00Z' }
    mockApi(routes({ 'GET /api/cook/timers': { now: '2026-11-09T12:00:00Z', timers: [running] } }))
    renderMeal()
    await userEvent.click(await screen.findByRole('button', { name: 'Start cooking' }))
    await screen.findByRole('article', { name: 'Step 1 of 2' })
    const rail = await screen.findByRole('complementary', { name: 'Timers and Ingredients' })
    expect(within(rail).getByRole('checkbox', { name: 'Chicken, 1.2 kg' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ingredients' })).not.toBeInTheDocument()
  })
})

describe('a Recipe cook', () => {
  it('uses the Recipe\'s Yield and Batches: "For 8 portions: 2 Batches of 4 portions", the amounts doubled', async () => {
    mockApi(routes({ 'GET /api/cook/recipes/7?batches=2': { ...recipeView, batches: 2 } }))
    renderRecipe(2)
    const tile = await getReady()
    expect(within(tile).getByText('For 8 portions: 2 Batches of 4 portions')).toBeInTheDocument()
    expect(within(tile).getByRole('checkbox', { name: 'Rice, 600 g' })).toBeInTheDocument()
  })

  it('a resumed session skips Get ready and opens on the Step it left', async () => {
    saveResume('recipe:7', 1)
    mockApi(routes({ 'GET /api/cook/recipes/7?batches=1': recipeView }))
    renderRecipe(1)
    expect(await screen.findByRole('article', { name: 'Step 2 of 2' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Get ready' })).not.toBeInTheDocument()
  })

  it('a first Step of a session with a saved first Step is a resume too: no Get ready', async () => {
    saveResume('recipe:7', 0)
    mockApi(routes({ 'GET /api/cook/recipes/7?batches=1': recipeView }))
    renderRecipe(1)
    expect(await screen.findByRole('article', { name: 'Step 1 of 2' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Get ready' })).not.toBeInTheDocument()
  })
})
