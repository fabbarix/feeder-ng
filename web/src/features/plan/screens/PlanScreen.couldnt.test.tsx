import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlanScreen } from './PlanScreen'
import { meal, mockApi, renderWithProviders, slot } from '../test-utils'
import type { Eliminations, PlanSlot, PlanView, UnfilledReason } from '../types'

afterEach(() => vi.unstubAllGlobals())

const none: Eliminations = { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 }
function unplanned(date: string, id: number, reason: UnfilledReason = 'no_attendance', over: Partial<Eliminations> = {}): PlanSlot {
  return slot({ date, mealSlotId: id, meal: null, unfilled: { reason, slotRuleClaimed: false, eliminated: { ...none, ...over } } })
}
const view = (slots: PlanSlot[]): PlanView => ({ today: '2026-11-10', horizonDays: 3, updating: false, slots })
const dayTile = (name: string) => screen.findByRole('heading', { name: name === 'Today' ? /· Today$/ : name === 'Tomorrow' ? /· Tomorrow$/ : new RegExp(`^${name.slice(0, 3)} \\d`) }).then((h) => h.closest('article') as HTMLElement)

// Scenario: nobody is set to attend two dinners. The Plan groups them in one notice at the top and marks each day.
const nobodyAttends = view([
  unplanned('2026-11-10', 2),
  unplanned('2026-11-11', 2),
  slot({ date: '2026-11-12', mealSlotId: 3, name: 'Lunch', meal: meal({ date: '2026-11-12', mealSlotId: 3, recipeName: 'Stew' }) }), // a different Meal Slot: both Dinners are affected, so "every dinner"
])

describe('PlanScreen: Couldn\'t plan', () => {
  it('shows one grouped notice at the top, above the week, not a line per slot', async () => {
    mockApi({ 'GET /api/plan': nobodyAttends })
    renderWithProviders(<PlanScreen />)
    const notice = await screen.findByRole('region', { name: "Couldn't plan" })
    expect(within(notice).getAllByRole('group')).toHaveLength(1) // one cause row (B9-32, PC-07: one compact tile)
    expect(within(notice).getByRole('group', { name: '2 Meal Slots' })).toHaveTextContent('Nobody is set to attend.')
    const grid = screen.getByRole('group', { name: 'Plan' })
    expect(notice.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText(/Couldn't plan (Tuesday|Wednesday) dinner/)).not.toBeInTheDocument()
  })

  it('works from the plan it already has: no second request for the unplanned slots', async () => {
    const api = mockApi({ 'GET /api/plan': nobodyAttends })
    renderWithProviders(<PlanScreen />)
    await screen.findByRole('region', { name: "Couldn't plan" })
    expect(api.calls.some((c) => c.path === '/api/plan/couldnt-plan')).toBe(false)
  })

  it('each affected day tile has a "Not planned" row with its cause as one info chip; a planned day has none (B9-32, PC-07)', async () => {
    mockApi({ 'GET /api/plan': nobodyAttends })
    renderWithProviders(<PlanScreen />)
    const today = await dayTile('Today')
    expect(within(today).getByText('Not planned').closest('.list-row__title')).not.toBeNull()
    expect(within(today).getByText('Nobody attending').closest('.chip')).toHaveAttribute('data-status', 'info')
    expect(within(await dayTile('Tomorrow')).getByText('Not planned')).toBeInTheDocument()
    expect(within(await dayTile('Thursday')).queryByText('Not planned')).not.toBeInTheDocument()
  })

  it('the fix action goes to the Meal Slots', async () => {
    mockApi({ 'GET /api/plan': nobodyAttends })
    renderWithProviders(
      <Routes>
        <Route path="/" element={<PlanScreen />} />
        <Route path="/settings/meal-slots" element={<p>Meal Slots page</p>} />
      </Routes>,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Choose who attends' }))
    expect(await screen.findByText('Meal Slots page')).toBeInTheDocument()
  })

  it('"Choose a Recipe" as a cause fix opens the Recipe chooser for the first affected meal', async () => {
    mockApi({ 'GET /api/plan': view([unplanned('2026-11-10', 2, 'no_candidates', { considered: 2 })]), 'GET /api/recipes': [] })
    renderWithProviders(<PlanScreen />)
    const notice = await screen.findByRole('region', { name: "Couldn't plan" })
    await userEvent.click(within(notice).getByRole('button', { name: 'Choose a Recipe' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('a rule conflict is warn, not danger, and a mixed plan gets one row per cause in the one tile', async () => {
    mockApi({ 'GET /api/plan': view([unplanned('2026-11-10', 2), unplanned('2026-11-11', 2, 'no_candidates', { considered: 3, advanceStep: 3 })]) })
    renderWithProviders(<PlanScreen />)
    const notice = await screen.findByRole('region', { name: "Couldn't plan" })
    expect(within(notice).getAllByRole('group')).toHaveLength(2)
    expect(notice.querySelector('[data-status="danger"]')).toBeNull()
    expect(notice.querySelector('[data-cause="advance_step"][data-tone="warn"]')).not.toBeNull()
  })

  it('R13: a plain User is not sent to Admin-only settings: no "Choose who attends" button', async () => {
    mockApi({ 'GET /api/plan': nobodyAttends, 'GET /api/me': { id: 2, email: 'u@example.com', displayName: 'U', isAdmin: false } })
    renderWithProviders(<PlanScreen />)
    const notice = await screen.findByRole('region', { name: "Couldn't plan" })
    await waitFor(() => expect(within(notice).queryByRole('button', { name: 'Choose who attends' })).not.toBeInTheDocument())
    expect(within(notice).getByText(/Ask an Admin/)).toBeInTheDocument()
  })

  it('R13: slots whose time has gone (no meal, no reason) do not stop the sheet reading "every dinner" (23:56); the summary is in "Show which meals"', async () => {
    const gone = slot({ date: '2026-11-10', mealSlotId: 2, meal: null, unfilled: null })
    mockApi({ 'GET /api/plan': view([gone, unplanned('2026-11-11', 2), unplanned('2026-11-12', 2)]) })
    renderWithProviders(<PlanScreen />)
    const notice = await screen.findByRole('region', { name: "Couldn't plan" })
    await userEvent.click(within(notice).getByRole('button', { name: 'Show which meals' }))
    expect(within(await screen.findByRole('dialog', { name: "Couldn't plan" })).getByText('Every dinner this week')).toBeInTheDocument()
  })

  it('"Show which meals" opens the sheet of the affected meals; Choose a Recipe there opens the chooser for that Course', async () => {
    mockApi({ 'GET /api/plan': view([unplanned('2026-11-10', 2, 'no_candidates', { considered: 2 })]), 'GET /api/recipes': [] })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Show which meals' }))
    const sheet = await screen.findByRole('dialog', { name: "Couldn't plan" })
    await userEvent.click(within(sheet).getByRole('button', { name: /^Choose a Recipe for / }))
    expect(await screen.findByRole('dialog', { name: /Choose a Recipe/ })).toBeInTheDocument()
  })

  it('no notice at all when everything is planned', async () => {
    mockApi({ 'GET /api/plan': view([slot({ date: '2026-11-10', meal: meal() })]) })
    renderWithProviders(<PlanScreen />)
    await screen.findByRole('heading', { name: /· Today$/ })
    expect(screen.queryByRole('region', { name: "Couldn't plan" })).not.toBeInTheDocument()
  })
})
