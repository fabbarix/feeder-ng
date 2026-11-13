// CRS G2: Couldn't plan on the Plan with Courses, end to end through the (stubbed) API.
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXCLUDED, NO_COURSE_RECIPES, NOBODY, dinner, empty, planned } from '../couldnt-fixtures'
import { mockApi, renderWithProviders } from '../test-utils'
import type { PlanSlot, PlanView } from '../types'
import { PlanScreen } from './PlanScreen'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))
afterEach(() => vi.unstubAllGlobals())

const view = (slots: PlanSlot[]): PlanView => ({ today: '2026-11-10', horizonDays: 3, updating: false, slots })
// ds-plan: the day title is "Mon 9 · Today" / "Thu 12" (was Today / Thursday).
const tileOf = async (name: string) =>
  (await screen.findByRole('heading', { name: name === 'Today' ? /· Today$/ : new RegExp(`^${name.slice(0, 3)} \\d`) })).closest('article') as HTMLElement
// ds-plan: a Course row is a ListRow (an <li> with no aria-label): found by the Course label in its meta line.
const courseRow = (scope: HTMLElement, name: string) =>
  within(scope).getAllByRole('listitem').find((li) => li.querySelector('.list-row__meta')?.textContent?.startsWith(name)) as HTMLElement

const Where = () => {
  const l = useLocation()
  return <p>at {l.pathname + l.search}</p>
}
const renderPlan = () =>
  renderWithProviders(
    <Routes>
      <Route path="/" element={<PlanScreen />} />
      <Route path="*" element={<Where />} />
    </Routes>,
  )

// Tue and Wed: the Side is excluded. Thu: everything planned.
const sideExcluded = view([
  dinner('2026-11-10', [planned(1, 'Main'), empty(2, 'Side', EXCLUDED)]),
  dinner('2026-11-11', [planned(1, 'Main'), empty(2, 'Side', EXCLUDED)]),
  dinner('2026-11-12', [planned(1, 'Main'), planned(2, 'Side')]),
])

describe('PlanScreen: Couldn\'t plan per Course', () => {
  it('one notice at the top per cause, naming the Course', async () => {
    mockApi({ 'GET /api/plan': sideExcluded })
    renderPlan()
    const notice = await screen.findByRole('group', { name: "Couldn't plan" })
    expect(within(notice).getAllByRole('region')).toHaveLength(1)
    expect(within(notice).getByRole('heading', { name: "Couldn't plan 2 Sides. Every Recipe is excluded for someone who eats it." })).toBeInTheDocument()
    expect(within(notice).getByText('Side at Tuesday and Wednesday dinners')).toBeInTheDocument()
  })

  it('the Side row of each affected day says Not planned with the cause; the Main row and the other day do not', async () => {
    mockApi({ 'GET /api/plan': sideExcluded })
    renderPlan()
    const today = await tileOf('Today')
    const side = courseRow(today, 'Side')
    expect(within(side).getByText('Not planned').closest('.chip')).toHaveAttribute('data-status', 'spoil')
    expect(within(side).getByText('Every Recipe is excluded.')).toBeInTheDocument()
    expect(within(courseRow(today, 'Main')).queryByText('Not planned')).not.toBeInTheDocument()
    expect(within(await tileOf('Thursday')).queryByText('Not planned')).not.toBeInTheDocument()
  })

  it('Review Exclusions opens the Review Exclusions page, for the Admin and the plain User alike', async () => {
    mockApi({ 'GET /api/plan': sideExcluded, 'GET /api/me': { id: 2, email: 'u@example.com', displayName: 'U', isAdmin: false } })
    renderPlan()
    await userEvent.click(await screen.findByRole('button', { name: 'Review Exclusions' }))
    expect(await screen.findByText('at /plan/couldnt-plan/excluded')).toBeInTheDocument()
  })

  it('a line of "Show all" goes to its cell on that page', async () => {
    mockApi({ 'GET /api/plan': sideExcluded })
    renderPlan()
    await userEvent.click(await screen.findByRole('button', { name: 'Show all 2' }))
    await userEvent.click(screen.getByRole('link', { name: 'Wed 11 Nov · Dinner · Side' }))
    expect(await screen.findByText('at /plan/couldnt-plan/excluded')).toBeInTheDocument()
  })
})

describe('PlanScreen: No Recipes for this Course', () => {
  const noDessert = view([
    dinner('2026-11-10', [planned(1, 'Main'), empty(3, 'Dessert', NO_COURSE_RECIPES)]),
    dinner('2026-11-11', [planned(1, 'Main'), empty(3, 'Dessert', NO_COURSE_RECIPES)]),
  ])

  it('is an info tile whose fix opens the Recipes list of the Recipes not marked as Dessert', async () => {
    mockApi({ 'GET /api/plan': noDessert })
    const { container } = renderPlan()
    await userEvent.click(await screen.findByRole('button', { name: 'Mark Recipes as Dessert' }))
    expect(await screen.findByText('at /recipes?notCourse=3')).toBeInTheDocument()
    expect(container.querySelector('[data-status="danger"]')).toBeNull()
  })

  it('shows its Course row with the info chip and its reason', async () => {
    mockApi({ 'GET /api/plan': noDessert })
    renderPlan()
    const row = courseRow(await tileOf('Today'), 'Dessert')
    expect(within(row).getByText('Not planned').closest('.chip')).toHaveAttribute('data-status', 'info')
    expect(within(row).getByText('No Recipes for this Course.')).toBeInTheDocument()
  })
})

describe('PlanScreen: optional and not-served Courses never show a cause', () => {
  it('an optional Dessert left empty and a Course nobody eats give no tile and no chip', async () => {
    const quiet = view([
      dinner('2026-11-10', [
        planned(1, 'Main'),
        planned(2, 'Side'),
        { ...empty(3, 'Dessert', EXCLUDED), unfilled: null, optional: true, unserved: 'optional' },
      ]),
    ])
    mockApi({ 'GET /api/plan': quiet })
    renderPlan()
    await tileOf('Today')
    expect(screen.queryByRole('group', { name: "Couldn't plan" })).not.toBeInTheDocument()
    expect(screen.queryByText('Not planned')).not.toBeInTheDocument()
  })
})

describe('PlanScreen: Choose a Recipe for the Course', () => {
  it('the fix of a cause with no page opens the chooser for the Recipes of the first affected Course', async () => {
    const late = { reason: 'no_candidates' as const, slotRuleClaimed: false, eliminated: { considered: 3, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 3 } }
    const api = mockApi({
      'GET /api/plan': view([dinner('2026-11-10', [planned(1, 'Main'), empty(2, 'Side', late)])]),
      'GET /api/recipes?course=2': [],
    })
    renderPlan()
    const notice = await screen.findByRole('group', { name: "Couldn't plan" })
    await userEvent.click(within(notice).getByRole('button', { name: 'Choose a Recipe' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(api.callsTo('GET', '/api/recipes?course=2').length).toBeGreaterThan(0)
  })
})

describe('PlanScreen: Nobody attends with Courses', () => {
  it('counts the Meal Slot once, not once per Course', async () => {
    mockApi({ 'GET /api/plan': view([dinner('2026-11-10', [empty(1, 'Main', NOBODY), empty(2, 'Side', NOBODY)]), dinner('2026-11-11', [empty(1, 'Main', NOBODY), empty(2, 'Side', NOBODY)])]) })
    renderPlan()
    const notice = await screen.findByRole('group', { name: "Couldn't plan" })
    expect(within(notice).getByRole('heading', { name: "Couldn't plan 2 Meal Slots. Nobody is set to attend." })).toBeInTheDocument()
    expect(within(notice).getByText('Every dinner this week')).toBeInTheDocument()
  })
})
