// B9-39 (TB-01, TB-10): Today wires the hero: its name and why chips open the Planned Meal sheet, its ⋮ has Swap, Pin and Open Recipe, a slot
// that moves into To confirm is announced politely (and takes no focus), and a Swap from the hero says what changed.
// 2026-11-10 is a Tuesday. The seams are mocked as in TodayScreen.hero.test.tsx; `justServed` is the seam's new field.
import { act, screen, waitFor, within } from '@testing-library/react'
import { useQueryClient } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { createElement, useEffect, useReducer } from 'react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { favourite, meal, mockApi, renderWithProviders, slot } from '../../plan/test-utils'
import { TodayScreen } from './TodayScreen'

const h = vi.hoisted(() => ({
  now: new Date('2026-11-10T12:00:00Z'),
  toConfirm: [] as unknown[],
  justServed: [] as unknown[],
}))

const dinner = () =>
  slot({
    date: '2026-11-10', mealSlotId: 2, name: 'Dinner', time: '19:30', at: '2026-11-10T19:30:00Z',
    meal: meal({ recipeId: 7, recipeName: 'Chicken & leek pie', cookMinutes: 45, startBy: '18:45', why: [favourite('Anna')] }),
  })
const lunch = () =>
  slot({ date: '2026-11-10', mealSlotId: 1, name: 'Lunch', time: '13:00', at: '2026-11-10T13:00:00Z', courseId: 1, courseName: 'Main', meal: meal({ mealSlotId: 1, recipeName: 'Lentil soup' }) })

const laterLunch = () =>
  slot({ date: '2026-11-11', mealSlotId: 1, name: 'Lunch', time: '13:00', at: '2026-11-11T13:00:00Z', meal: meal({ date: '2026-11-11', mealSlotId: 1, recipeId: 3, recipeName: 'Lentil soup' }) })
const laterChange = { date: '2026-11-11', mealSlotId: 1, courseId: 1, before: { recipeId: 3, recipeName: 'Lentil soup', servedFromLeftover: false }, after: { recipeId: 4, recipeName: 'Roast chicken', servedFromLeftover: false }, why: [] }

vi.mock('../seams', () => ({
  useScanSessionActive: () => false,
  useTodayPlan: () => ({ today: '2026-11-10', hasNextMeal: true, toConfirm: h.toConfirm.length, couldntPlan: 0, leftovers: 0, loading: false }),
  useTodayStock: () => ({ spoiled: 0, useSoon: [], loading: false }),
  useTodayTileData: () => ({
    now: h.now, nextSlot: dinner(), toConfirm: h.toConfirm, justServed: h.justServed, couldntPlan: [], leftovers: [], planToday: '2026-11-10',
    spoiled: [], stockToday: '2026-11-10', system: 'metric', useSoon: [], throwOut: vi.fn(), keep: vi.fn(), planLoading: false, stockLoading: false,
  }),
  ShoppingListSeam: () => createElement('p', null, 'The Shopping List'),
}))

// The seams are mocked, so a change of what they answer shows on the next render of the screen: `bump` makes one.
let bump = () => {}
function TodayAgain() {
  const [, force] = useReducer((n: number) => n + 1, 0)
  const client = useQueryClient()
  bump = force
  // What the real seam would have cached: the What changed words name the meals from the plan view.
  useEffect(() => {
    client.setQueryData(['plan', 'view'], { today: '2026-11-10', horizonDays: 7, updating: false, slots: [dinner(), laterLunch()] })
  }, [client])
  return <TodayScreen />
}
const routed = (
  <Routes>
    <Route path="/" element={<TodayAgain />} />
    <Route path="/recipes/:id" element={<p>Recipe screen</p>} />
    <Route path="/cook/meal/:date/:slotId" element={<p>Cook Mode screen</p>} />
  </Routes>
)
const alternatives = { alternatives: [{ recipeId: 21, recipeName: 'Pizza', batches: 1, newLeftoverPortions: 0, newLeftoverUseBy: '2026-11-20', score: 1, why: [] }] }
const base = {
  'GET /api/today/advance-steps': { steps: [] },
  'GET /api/today/streak': { days: 0 },
  'GET /api/plan/2026-11-10/2/1/alternatives': alternatives,
}

afterEach(() => {
  h.now = new Date('2026-11-10T12:00:00Z')
  h.toConfirm = []
  h.justServed = []
  vi.unstubAllGlobals()
})

describe('Today: the hero opens the Planned Meal sheet (TB-10)', () => {
  it('the Recipe name opens the sheet of the meal', async () => {
    mockApi(base)
    renderWithProviders(routed, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Chicken & leek pie' }))
    expect(await screen.findByRole('dialog', { name: /Chicken & leek pie$/ })).toBeInTheDocument()
  })

  it('a why chip opens it too, and closing the sheet puts focus back on the chip that opened it', async () => {
    mockApi(base)
    renderWithProviders(routed, '/')
    const chip = await screen.findByRole('button', { name: "Why: Anna's favourite. Open the Planned Meal" })
    await userEvent.click(chip)
    const sheet = await screen.findByRole('dialog', { name: /Chicken & leek pie$/ })
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(sheet).not.toBeInTheDocument())
    expect(chip).toHaveFocus()
  })
})

describe('Today: the hero\'s ⋮ (TB-10)', () => {
  const open = async () => {
    renderWithProviders(routed, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Dinner actions' }))
  }

  it('lists Swap, Pin and Open Recipe first', async () => {
    mockApi(base)
    await open()
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent).slice(0, 3)).toEqual(['Swap', 'Pin', 'Open Recipe'])
  })

  it('Open Recipe goes to the Recipe', async () => {
    mockApi(base)
    await open()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Open Recipe' }))
    expect(await screen.findByText('Recipe screen')).toBeInTheDocument()
  })

  it('Pin pins the meal (the server\'s confirm)', async () => {
    const api = mockApi({ ...base, 'POST /api/plan/2026-11-10/2/1/confirm': meal({ pinned: true }) })
    await open()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Pin' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/2/1/confirm')).toHaveLength(1))
  })

  it('Swap opens the Swap sheet over Today; picking an Alternative writes the meal and says "Swapped" with Undo', async () => {
    const api = mockApi({ ...base, 'PUT /api/plan/2026-11-10/2/1': { ...meal({ recipeName: 'Pizza', pinned: true }), covered: [], changes: [], undoToken: 'tok' } })
    await open()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Swap' }))
    const sheet = await screen.findByRole('dialog', { name: /Swap Chicken & leek pie$/ })
    await userEvent.click(await within(sheet).findByRole('button', { name: /Pizza/ }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/plan/2026-11-10/2/1')).toHaveLength(1))
    expect(api.callsTo('PUT', '/api/plan/2026-11-10/2/1')[0]!.body).toMatchObject({ recipeId: 21 })
    const toast = await waitFor(() => {
      const t = document.querySelector('.toast')
      if (!t) throw new Error('no toast yet')
      return t as HTMLElement
    })
    expect(toast.querySelector('.toast__title')).toHaveTextContent(/^Swapped/)
    expect(within(toast).getByRole('button', { name: /^Undo/ })).toBeInTheDocument()
    expect(toast.querySelector('.toast__title svg')).toBeNull() // a success toast has no icon
    expect(screen.queryByText('Recipe screen')).not.toBeInTheDocument() // Today is never left
  })
})

describe('Today after a Swap that changes another meal (B9-26 PC-01 on Today: useTonightSheets().review)', () => {
  it('the toast offers Review and Undo; Review opens "What changed" over Today, and Keep the changes closes it', async () => {
    const api = mockApi({ ...base, 'PUT /api/plan/2026-11-10/2/1': { ...meal({ recipeName: 'Pizza', pinned: true }), changes: [laterChange], undoToken: 'tok-9' } })
    renderWithProviders(routed, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Dinner actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Swap' }))
    await userEvent.click(await screen.findByRole('button', { name: /Pizza/ }))
    const toast = await waitFor(() => {
      const t = document.querySelector('.toast')
      if (!t) throw new Error('no toast yet')
      return t as HTMLElement
    })
    expect(toast).toHaveTextContent(/Swapped/)
    expect(within(toast).getByRole('button', { name: /^Undo/ })).toBeInTheDocument()
    await userEvent.click(within(toast).getByRole('button', { name: /^Review/ }))
    const sheet = await screen.findByRole('dialog', { name: /What changed/ })
    expect(within(sheet).getByText(/Roast chicken/)).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Keep the changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /What changed/ })).toBeNull())
    expect(api.calls.filter((c) => c.method !== 'GET' && c.method !== 'PUT')).toHaveLength(0)
    expect(screen.queryByText('Recipe screen')).not.toBeInTheDocument()
  })
})

describe('Today: a slot that moves into To confirm is announced, not focused (TB-01)', () => {
  const live = () => document.querySelector('[aria-live="polite"]:not(.toast-live)')

  it('the first render says nothing', async () => {
    h.toConfirm = h.justServed = [lunch()]
    mockApi(base)
    renderWithProviders(routed, '/')
    await screen.findByRole('heading', { name: 'To confirm' })
    expect(live()?.textContent ?? '').toBe('')
  })

  it('when Lunch joins the just-served rows, a polite live region says "Lunch moved to To confirm." and focus does not move', async () => {
    mockApi(base)
    renderWithProviders(routed, '/')
    await screen.findByRole('button', { name: 'Dinner actions' })
    const before = document.activeElement
    h.toConfirm = h.justServed = [lunch()]
    act(() => bump())
    await waitFor(() => expect(live()).toHaveTextContent('Lunch moved to To confirm.'))
    expect(document.activeElement).toBe(before)
    // the To confirm tile now has the row, at the top
    const tile = screen.getByRole('heading', { name: 'To confirm' }).closest('section') as HTMLElement
    expect(within(tile).getAllByRole('listitem')[0]).toHaveTextContent('Lentil soup')
  })
})
