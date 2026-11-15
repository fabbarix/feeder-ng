// B9-32 (PC-07, FLOW-18): the fix of "No Recipes for this Course" stays on the Plan. The notice's "Mark Recipes as Dessert" and the Planned Meal sheet's
// "Mark Recipes as Side" (a relaxed pick) both open the sheet; saving POSTs, the plan refreshes in place, the toast reports it. TEST-AUTHOR tests.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXCLUDED, NO_COURSE_RECIPES, dinner, empty, planned } from '../couldnt-fixtures'
import { courseMeal, mockApi, planCourse, renderWithProviders } from '../test-utils'
import type { PlanView } from '../types'
import { PlanScreen } from './PlanScreen'

vi.mock('../../../lib/sse', () => ({ connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }) }))
afterEach(() => vi.unstubAllGlobals())

const Where = () => <p>at {useLocation().pathname + useLocation().search}</p>
const renderPlan = () =>
  renderWithProviders(
    <Routes>
      <Route path="/" element={<PlanScreen />} />
      <Route path="*" element={<Where />} />
    </Routes>,
  )
const view = (slots: ReturnType<typeof dinner>[]): PlanView => ({ today: '2026-11-10', horizonDays: 3, updating: false, slots })
const recipes = [{ id: 11, name: 'Tiramisu', totalMinutes: 30, courses: [{ id: 1, name: 'Main' }] }]
const noDessert = view(['2026-11-10', '2026-11-11'].map((d) => dinner(d, [planned(1, 'Main'), empty(3, 'Dessert', NO_COURSE_RECIPES)])))
const filled = view(['2026-11-10', '2026-11-11'].map((d) => dinner(d, [planned(1, 'Main'), planCourse({ courseId: 3, name: 'Dessert', main: false, meal: courseMeal(3, 'Dessert', { date: d, recipeName: 'Tiramisu' }) })])))
const change = (date: string) => ({ date, mealSlotId: 4, courseId: 3, before: null, after: { recipeId: 11, recipeName: 'Tiramisu', servedFromLeftover: false }, why: [] })

describe('PlanScreen: Mark Recipes as Dessert stays on the Plan', () => {
  it('opens the sheet from the tile, marks one Recipe, shows the meals planned, and the route never changes', async () => {
    let planned = false
    const api = mockApi({
      'GET /api/plan': () => (planned ? filled : noDessert),
      'GET /api/recipes?notCourse=3': recipes,
      'POST /api/courses/3/recipes': () => {
        planned = true
        return { marked: 1, changes: [change('2026-11-10'), change('2026-11-11')], undoToken: 'tok' }
      },
    })
    renderPlan()
    await userEvent.click(await screen.findByRole('button', { name: 'Mark Recipes as Dessert' }))
    const sheet = await screen.findByRole('dialog', { name: 'Mark Recipes as Dessert' })
    expect(within(sheet).getByText("Couldn't plan 2 Desserts")).toBeInTheDocument()
    await userEvent.click(await within(sheet).findByRole('checkbox', { name: /Tiramisu/ }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Mark 1 Recipe as Dessert' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/courses/3/recipes')).toHaveLength(1))
    // the plan refreshes in place: the notice goes, the Dessert rows are filled
    await waitFor(() => expect(screen.queryByRole('region', { name: "Couldn't plan" })).not.toBeInTheDocument())
    expect(await screen.findAllByText('Tiramisu')).toHaveLength(2)
    expect(screen.queryByText(/^at \//)).not.toBeInTheDocument()
    await waitFor(() => expect([...document.querySelectorAll('.toast')].some((t) => /1 Recipe marked as Dessert/.test(t.textContent ?? '') && /2 meals planned/.test(t.textContent ?? ''))).toBe(true))
  })

  it('Cancel returns focus to the button that opened the sheet (never to the page)', async () => {
    mockApi({ 'GET /api/plan': noDessert, 'GET /api/recipes?notCourse=3': recipes })
    renderPlan()
    const fix = await screen.findByRole('button', { name: 'Mark Recipes as Dessert' })
    await userEvent.click(fix)
    const sheet = await screen.findByRole('dialog', { name: 'Mark Recipes as Dessert' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.activeElement).toBe(fix)
  })

  it('a plain User may mark Recipes too (Recipes are household content)', async () => {
    mockApi({ 'GET /api/plan': noDessert, 'GET /api/recipes?notCourse=3': recipes, 'GET /api/me': { id: 2, email: 'u@example.com', displayName: 'U', isAdmin: false } })
    renderPlan()
    await userEvent.click(await screen.findByRole('button', { name: 'Mark Recipes as Dessert' }))
    expect(await screen.findByRole('dialog', { name: 'Mark Recipes as Dessert' })).toBeInTheDocument()
  })

  it('the Planned Meal sheet\'s "Mark Recipes as Side" (a relaxed Side) opens the same sheet instead of leaving for /recipes', async () => {
    const relaxed = view([dinner('2026-11-10', [planned(1, 'Main'), planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { recipeName: 'Green beans', recipeId: 8, relaxed: true, why: [{ code: 'cooldown_relaxed', date: '2026-11-08', recipeId: 8 }] }) })])])
    mockApi({ 'GET /api/plan': relaxed, 'GET /api/recipes?notCourse=2': recipes })
    renderPlan()
    await userEvent.click(await screen.findByRole('button', { name: 'Green beans' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Mark Recipes as Side' }))
    expect(await screen.findByRole('dialog', { name: 'Mark Recipes as Side' })).toBeInTheDocument()
    expect(screen.queryByText(/^at \//)).not.toBeInTheDocument()
  })
})

describe('the other causes keep their pages', () => {
  it('Review Exclusions still goes to its page', async () => {
    mockApi({ 'GET /api/plan': view(['2026-11-10'].map((d) => dinner(d, [planned(1, 'Main'), empty(2, 'Side', EXCLUDED)]))) })
    renderPlan()
    await userEvent.click(await screen.findByRole('button', { name: 'Review Exclusions' }))
    expect(await screen.findByText('at /plan/couldnt-plan/excluded')).toBeInTheDocument()
  })
})
