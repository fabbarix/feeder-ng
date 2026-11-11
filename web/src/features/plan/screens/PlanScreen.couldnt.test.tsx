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
const widthStub = (width: number) =>
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    return { matches: min ? width >= Number(min[1]) : false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }
  })
const dayTile = (name: string) => screen.findByRole('heading', { name }).then((h) => h.closest('article') as HTMLElement)

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
    const notice = await screen.findByRole('group', { name: "Couldn't plan" })
    expect(within(notice).getAllByRole('region')).toHaveLength(1)
    expect(within(notice).getByRole('heading', { name: "Couldn't plan 2 Meal Slots. Nobody is set to attend." })).toBeInTheDocument()
    expect(within(notice).getByText('Every dinner this week')).toBeInTheDocument()
    const grid = screen.getByRole('group', { name: 'Plan' })
    expect(notice.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText(/Couldn't plan (Tuesday|Wednesday) dinner/)).not.toBeInTheDocument()
  })

  it('works from the plan it already has: no second request for the unplanned slots', async () => {
    const api = mockApi({ 'GET /api/plan': nobodyAttends })
    renderWithProviders(<PlanScreen />)
    await screen.findByRole('group', { name: "Couldn't plan" })
    expect(api.calls.some((c) => c.path === '/api/plan/couldnt-plan')).toBe(false)
  })

  it('each affected day tile has a small "Not planned" chip; a planned day has none', async () => {
    mockApi({ 'GET /api/plan': nobodyAttends })
    renderWithProviders(<PlanScreen />)
    const today = await dayTile('Today')
    expect(within(today).getByText('Not planned').closest('.chip')).toHaveAttribute('data-status', 'info')
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
    const notice = await screen.findByRole('group', { name: "Couldn't plan" })
    await userEvent.click(within(notice).getByRole('button', { name: 'Choose a Recipe' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('a rule conflict is warn, not danger, and a mixed plan gets one tile per cause', async () => {
    mockApi({ 'GET /api/plan': view([unplanned('2026-11-10', 2), unplanned('2026-11-11', 2, 'no_candidates', { considered: 3, coolDown: 3 })]) })
    renderWithProviders(<PlanScreen />)
    const notice = await screen.findByRole('group', { name: "Couldn't plan" })
    expect(within(notice).getAllByRole('region')).toHaveLength(2)
    expect(notice.querySelector('[data-status="danger"]')).toBeNull()
    expect(notice.querySelector('[data-cause="cool_down"][data-status="spoil"]')).not.toBeNull()
  })

  it('in the 7-column week the chip is still there', async () => {
    widthStub(1280)
    mockApi({ 'GET /api/plan': nobodyAttends })
    renderWithProviders(<PlanScreen />)
    expect(within(await dayTile('Today')).getByText('Not planned')).toBeInTheDocument()
  })

  it('R13: a plain User is not sent to Admin-only settings: no "Choose who attends" button', async () => {
    mockApi({ 'GET /api/plan': nobodyAttends, 'GET /api/me': { id: 2, email: 'u@example.com', displayName: 'U', isAdmin: false } })
    renderWithProviders(<PlanScreen />)
    const notice = await screen.findByRole('group', { name: "Couldn't plan" })
    await waitFor(() => expect(within(notice).queryByRole('button', { name: 'Choose who attends' })).not.toBeInTheDocument())
    expect(within(notice).getByText(/Ask an Admin/)).toBeInTheDocument()
  })

  it('R13: slots whose time has gone (no meal, no reason) do not stop it reading "every dinner" (23:56)', async () => {
    const gone = slot({ date: '2026-11-10', mealSlotId: 2, meal: null, unfilled: null })
    mockApi({ 'GET /api/plan': view([gone, unplanned('2026-11-11', 2), unplanned('2026-11-12', 2)]) })
    renderWithProviders(<PlanScreen />)
    const notice = await screen.findByRole('group', { name: "Couldn't plan" })
    expect(within(notice).getByText('Every dinner this week')).toBeInTheDocument()
  })

  it('no notice at all when everything is planned', async () => {
    mockApi({ 'GET /api/plan': view([slot({ date: '2026-11-10', meal: meal() })]) })
    renderWithProviders(<PlanScreen />)
    await screen.findByRole('heading', { name: 'Today' })
    expect(screen.queryByRole('group', { name: "Couldn't plan" })).not.toBeInTheDocument()
  })
})
