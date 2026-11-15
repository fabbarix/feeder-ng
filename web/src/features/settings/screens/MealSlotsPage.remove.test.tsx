// SAFE-02 (decisions SAFE 4 and SAFE 7) and SET-15, on the Meal Slots page.
//   Remove Meal Slot: the sheet's ⋮ -> "Remove Meal Slot" -> GET impact of each ticked day -> a danger confirm (Goes / Stays rows, Cancel
//   focused) -> POST /api/meal-slots/remove {ids} (204, soft removal, all or nothing) -> the sheet closes -> one Undo toast ("Dinner on
//   Monday removed", "Dinner removed") -> Undo is POST /api/meal-slots/restore {ids} -> "… is back".
//   B9-42 ruling: Remove acts on the days ticked in the sheet, like Save; unsaved edits go with the sheet (the confirm is the question).
//   Removed Meal Slots: a tile under the cards, from `GET /api/meal-slots?removed=with-history`; "Put back" restores the row in one call.
// Built on B9-18 (`useUndoToast`, ConfirmDialog `groups`) and B9-14 (the ⋮ footer): red on this branch until those are built.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findToast } from '../../../test/notices'
import { householdSettings } from '../components/fixtures'
import { fabio, mia } from '../components/mealSlotCardFixtures'
import { ADMIN_ME, mockApi, renderWithProviders, USER_ME } from '../test-utils'
import type { MealSlot } from '../types'
import { MealSlotsPage } from './MealSlotsPage'

const both = [mia, fabio].map((m) => ({ memberId: m.id, portionFactorOverride: null }))
const main = { id: 1, name: 'Main', main: true, optional: false, optOutMemberIds: [] }
const slot = (id: number, weekday: number, name: string, time: string): MealSlot => ({ id, weekday, name, time, portionsNeeded: 2, attendance: both, courses: [main] })
/** Dinner every day (ids 601..607, Monday is 601), Lunch on Sunday (id 650). */
const household = (): MealSlot[] => [...[1, 2, 3, 4, 5, 6, 7].map((d) => slot(600 + d, d, 'Dinner', '19:30')), slot(650, 7, 'Lunch', '13:00')]

const meal = (date: string, over: Record<string, unknown> = {}) => ({
  date, mealSlotId: 601, mealSlotName: 'Dinner', courseId: 1, courseName: 'Main', recipeId: 5, recipeName: 'Pasta', pinned: false, bought: [], ...over,
})
const impact = {
  plannedMeals: [meal('2026-11-09'), meal('2026-11-16'), meal('2026-11-23')],
  slotRules: [{ id: 3, mealSlotId: 601, mealSlotName: 'Dinner', courseId: 1, courseName: 'Main', recipeId: 5, recipeName: 'Pasta al pomodoro' }],
  toConfirm: [meal('2026-11-14')],
  cookedKept: 4,
}
const empty = { plannedMeals: [], slotRules: [], toConfirm: [], cookedKept: 0 }
const snack = { ids: [41, 42, 43, 44, 45], name: 'Snack', weekdays: [1, 2, 3, 4, 5], time: '16:30', removedAt: '2026-11-14T12:00:00Z', cookedCount: 6, notCookedCount: 0 }
const brunch = { ids: [51], name: 'Brunch', weekdays: [7], time: '11:00', removedAt: '2026-11-02T12:00:00Z', cookedCount: 3, notCookedCount: 1 }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 9, 12, 0) }) // Monday 9 Nov 2026
  // The sheet's ⋮ is a popover menu (menuitem rows) from 768 px; these tests read it so.
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: /min-width/.test(q), media: q, addEventListener() {}, removeEventListener() {} }))
  window.location.hash = ''
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function routes(me = ADMIN_ME, extra: Record<string, unknown> = {}) {
  let slots = household()
  let removed: unknown[] = []
  const api = mockApi({
    'GET /api/me': me,
    'GET /api/household/settings': householdSettings,
    'GET /api/members': [mia, fabio],
    'GET /api/meal-slots': () => slots,
    'GET /api/meal-slots?removed=with-history': () => removed,
    'GET /api/meal-slots/601/impact': impact,
    ...Object.fromEntries([602, 603, 604, 605, 606, 607, 650].map((id) => [`GET /api/meal-slots/${id}/impact`, empty])),
    'POST /api/meal-slots/remove': (c: { body: { ids: number[] } }) => {
      slots = slots.filter((s) => !c.body.ids.includes(s.id))
      return { status: 204 }
    },
    'POST /api/meal-slots/restore': (c: { body: { ids: number[] } }) => {
      const back = household().filter((s) => c.body.ids.includes(s.id))
      slots = [...slots, ...back]
      return { slots: back }
    },
    ...extra,
  })
  return { api, setRemoved: (v: unknown[]) => (removed = v), addSlots: (more: MealSlot[]) => (slots = [...slots, ...more]) }
}

/** An Admin opens Monday's Dinner and its ⋮ menu, and asks to remove it. */
async function askToRemove() {
  const dinner = await screen.findByRole('region', { name: 'Dinner' })
  await userEvent.click(within(dinner).getByRole('button', { name: /^Dinner on Monday/ }))
  const sheet = await screen.findByRole('dialog', { name: 'Edit Meal Slot' })
  await userEvent.click(within(sheet).getByRole('button', { name: 'More for Dinner' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove Meal Slot' }))
}
const confirm = () => screen.findByRole('dialog', { name: 'Remove Dinner on Monday?' })

describe('Remove Meal Slot: the confirm (SAFE-02, R-E)', () => {
  it('reads the impact first, then asks "Remove Dinner on Monday?" with what goes and what stays as rows', async () => {
    const { api } = routes()
    renderWithProviders(<MealSlotsPage />)
    await askToRemove()
    const dialog = await confirm()
    expect(api.callsTo('GET', '/api/meal-slots/601/impact')).toHaveLength(1)
    expect(api.callsTo('POST', '/api/meal-slots/remove')).toHaveLength(0)
    expect(within(dialog).getByText('Dinner stays on the other days.')).toBeInTheDocument()
    expect(within(dialog).getByText('Goes')).toBeInTheDocument()
    expect(within(dialog).getByText('Stays')).toBeInTheDocument()
    const rows = within(dialog).getAllByRole('listitem').map((r) => r.textContent)
    expect(rows[0]).toContain('Planned Meals')
    expect(rows[0]).toContain('3')
    expect(rows[0]).toContain('From today, Mon 9 to Mon 23')
    expect(rows[1]).toContain('Slot Rule')
    expect(rows[1]).toContain('Dinner = Pasta al pomodoro stops applying')
    expect(rows[2]).toContain('To confirm')
    expect(rows[2]).toContain('Sat Dinner')
    expect(rows[3]).toContain('Cooked history')
    expect(rows[3]).toContain('Kept')
  })
  it('is a danger dialog with no Close: Cancel has focus, the other button is "Remove Meal Slot"', async () => {
    routes()
    renderWithProviders(<MealSlotsPage />)
    await askToRemove()
    const dialog = await confirm()
    expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(within(dialog).getByRole('button', { name: 'Remove Meal Slot' })).toBeInTheDocument()
  })
  it('is never a paragraph wall: one lead line, then rows', async () => {
    routes()
    renderWithProviders(<MealSlotsPage />)
    await askToRemove()
    const dialog = await confirm()
    expect(dialog.querySelectorAll('.confirm-dialog__body')).toHaveLength(0)
    expect(dialog.querySelectorAll('.confirm-dialog__lead')).toHaveLength(1)
  })
  it('Cancel removes nothing and leaves the Edit sheet open', async () => {
    const { api } = routes()
    renderWithProviders(<MealSlotsPage />)
    await askToRemove()
    await userEvent.click(within(await confirm()).getByRole('button', { name: 'Cancel' }))
    expect(api.callsTo('POST', '/api/meal-slots/remove')).toHaveLength(0)
    expect(screen.getByRole('dialog', { name: 'Edit Meal Slot' })).toBeInTheDocument()
  })
  it('when the impact cannot be read nothing is removed and a toast says so', async () => {
    const { api } = routes(ADMIN_ME, { 'GET /api/meal-slots/601/impact': { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    renderWithProviders(<MealSlotsPage />)
    await askToRemove()
    await findToast('Couldn')
    expect(screen.queryByRole('dialog', { name: 'Remove Dinner on Monday?' })).toBeNull()
    expect(api.callsTo('POST', '/api/meal-slots/remove')).toHaveLength(0)
  })
})

describe('Remove Meal Slot: then Undo (SAFE 4, 7)', () => {
  it('Remove is DELETE; the sheet closes; an Undo toast names the Meal Slot', async () => {
    const { api } = routes()
    renderWithProviders(<MealSlotsPage />)
    await askToRemove()
    await userEvent.click(within(await confirm()).getByRole('button', { name: 'Remove Meal Slot' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/meal-slots/remove')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/meal-slots/remove')[0]!.body).toEqual({ ids: [601] })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit Meal Slot' })).toBeNull())
    const toast = await findToast('Dinner on Monday removed')
    expect(within(toast).getByRole('button', { name: 'Undo: put back Dinner on Monday' })).toBeInTheDocument()
    expect(toast.querySelector('.toast__icon, .toast__status-icon')).toBeNull()
  })
  it('the cards show the day gone (a dashed "+" for Monday) and the removed list is read again', async () => {
    const { api } = routes()
    renderWithProviders(<MealSlotsPage />)
    const before = api.callsTo('GET', '/api/meal-slots?removed=with-history').length
    await askToRemove()
    await userEvent.click(within(await confirm()).getByRole('button', { name: 'Remove Meal Slot' }))
    expect(await screen.findByRole('button', { name: 'Add Dinner on Monday' })).toBeInTheDocument()
    await waitFor(() => expect(api.callsTo('GET', '/api/meal-slots?removed=with-history').length).toBeGreaterThan(before))
  })
  it('focus is never left on the page behind after the sheet is gone', async () => {
    routes()
    renderWithProviders(<MealSlotsPage />)
    await askToRemove()
    await userEvent.click(within(await confirm()).getByRole('button', { name: 'Remove Meal Slot' }))
    await findToast('Dinner on Monday removed')
    expect(document.activeElement).not.toBe(document.body)
  })
  it('Undo is POST restore of the same id, then "Dinner on Monday is back" and the day returns', async () => {
    const { api } = routes()
    renderWithProviders(<MealSlotsPage />)
    await askToRemove()
    await userEvent.click(within(await confirm()).getByRole('button', { name: 'Remove Meal Slot' }))
    const toast = await findToast('Dinner on Monday removed')
    await userEvent.click(within(toast).getByRole('button', { name: 'Undo: put back Dinner on Monday' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/meal-slots/restore')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/meal-slots/restore')[0]!.body).toEqual({ ids: [601] })
    await findToast('Dinner on Monday is back')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Add Dinner on Monday' })).toBeNull())
  })
  it('a refused Undo (the name is taken) says why, in the server\'s words, and what to do', async () => {
    routes(ADMIN_ME, {
      'POST /api/meal-slots/restore': { status: 409, json: { error: { code: 'meal_slot_name_taken', message: 'There is already a Dinner on Monday.', ids: [601], weekdays: [1] } } },
    })
    renderWithProviders(<MealSlotsPage />)
    await askToRemove()
    await userEvent.click(within(await confirm()).getByRole('button', { name: 'Remove Meal Slot' }))
    await userEvent.click(within(await findToast('Dinner on Monday removed')).getByRole('button', { name: 'Undo: put back Dinner on Monday' }))
    await findToast('There is already a Dinner on Monday.')
    await findToast('Rename or remove that Meal Slot first.')
  })
  it('a plain User has no way to remove: no ⋮ and no Edit sheet at all', async () => {
    routes(USER_ME)
    renderWithProviders(<MealSlotsPage />)
    const dinner = await screen.findByRole('region', { name: 'Dinner' })
    expect(within(dinner).queryByRole('button', { name: /^Dinner on Monday/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^More for/ })).toBeNull()
  })
})

describe('Removed Meal Slots (SET-15)', () => {
  it('lists the removed Meal Slots with Cooked history under the cards, newest removal first', async () => {
    const { setRemoved } = routes()
    setRemoved([brunch, snack])
    renderWithProviders(<MealSlotsPage />)
    const tile = await screen.findByRole('region', { name: 'Removed Meal Slots' })
    const all = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label') ?? r.textContent)
    expect(all.indexOf('Dinner')).toBeLessThan(all.findIndex((x) => String(x).startsWith('Removed Meal Slots')))
    const rows = within(tile).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Snack · Mon to Fri')
    expect(rows[0]).toHaveTextContent('6 Cooked')
    expect(rows[1]).toHaveTextContent('Brunch · Sun')
    expect(rows[1]).toHaveTextContent('3 Cooked · 1 Not cooked')
  })
  it('is not drawn when nothing is removed', async () => {
    routes()
    renderWithProviders(<MealSlotsPage />)
    await screen.findByRole('region', { name: 'Dinner' })
    expect(screen.queryByRole('region', { name: 'Removed Meal Slots' })).toBeNull()
  })
  it('a plain User sees the tile without "Put back"', async () => {
    const { setRemoved } = routes(USER_ME)
    setRemoved([snack])
    renderWithProviders(<MealSlotsPage />)
    expect(await screen.findByRole('region', { name: 'Removed Meal Slots' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Put back/ })).toBeNull()
  })
  it('"Put back" restores every Meal Slot of the row in one call, then says "Snack is back"', async () => {
    const { setRemoved, api } = routes(ADMIN_ME, {
      'POST /api/meal-slots/restore': (c: { body: { ids: number[] } }) => ({ slots: c.body.ids.map((id) => slot(id, id - 40, 'Snack', '16:30')) }),
    })
    setRemoved([snack])
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Put back Snack · Mon to Fri' }))
    await findToast('Snack is back')
    expect(api.callsTo('POST', '/api/meal-slots/restore')).toHaveLength(1)
    expect(api.callsTo('POST', '/api/meal-slots/restore')[0]!.body).toEqual({ ids: [41, 42, 43, 44, 45] })
    expect(api.calls.filter((c) => c.method === 'POST' && /\/\d+\/restore$/.test(c.path))).toHaveLength(0)
  })
  it('after the restore focus moves to the restored card', async () => {
    let add: (m: MealSlot[]) => void = () => {}
    const r = routes(ADMIN_ME, {
      'POST /api/meal-slots/restore': (c: { body: { ids: number[] } }) => {
        const back = c.body.ids.map((id) => slot(id, id - 40, 'Snack', '16:30'))
        add(back)
        return { slots: back }
      },
    })
    add = r.addSlots
    r.setRemoved([snack])
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Put back Snack \u00b7 Mon to Fri' }))
    await findToast('Snack is back')
    await waitFor(() => expect(screen.getByRole('region', { name: 'Snack' }).contains(document.activeElement)).toBe(true))
  })
  it('a taken name puts nothing back (all or nothing), keeps the row and says so in the warning words', async () => {
    const { setRemoved, api } = routes(ADMIN_ME, {
      'POST /api/meal-slots/restore': { status: 409, json: { error: { code: 'meal_slot_name_taken', message: 'There is already a Snack on Tuesday.', ids: [42], weekdays: [2] } } },
    })
    setRemoved([snack])
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Put back Snack · Mon to Fri' }))
    const toast = await findToast('There is already a Snack on Tuesday.')
    expect(toast).toHaveTextContent('Snack was not put back')
    await findToast('Rename or remove that Meal Slot first.')
    expect(api.callsTo('POST', '/api/meal-slots/restore')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Put back Snack · Mon to Fri' })).toBeInTheDocument()
  })
})

// B9-42 ruling: Remove acts on the days ticked in the sheet, like Save would.
describe('Remove Meal Slot acts on the days ticked in the sheet', () => {
  async function openFromCard() {
    const dinner = await screen.findByRole('region', { name: 'Dinner' })
    await userEvent.click(within(dinner).getByRole('button', { name: 'Edit Dinner' }))
    return screen.findByRole('dialog', { name: 'Edit Meal Slot' })
  }
  async function pressRemove(sheet: HTMLElement) {
    await userEvent.click(within(sheet).getByRole('button', { name: 'More for Dinner' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove Meal Slot' }))
  }
  it('from an "Every day" card, all seven days ticked: "Remove Dinner?" with no lead, the seven read and removed in one call', async () => {
    const { api } = routes()
    renderWithProviders(<MealSlotsPage />)
    await pressRemove(await openFromCard())
    const dialog = await screen.findByRole('dialog', { name: 'Remove Dinner?' })
    expect(dialog.querySelector('.confirm-dialog__lead')).toBeNull()
    expect([601, 602, 603, 604, 605, 606, 607].every((id) => api.callsTo('GET', `/api/meal-slots/${id}/impact`).length === 1)).toBe(true)
    expect(api.callsTo('GET', '/api/meal-slots/650/impact')).toHaveLength(0)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove Meal Slot' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/meal-slots/remove')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/meal-slots/remove')[0]!.body).toEqual({ ids: [601, 602, 603, 604, 605, 606, 607] })
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Dinner' })).toBeNull())
  })
  it('one Undo puts every day back in one call: "Dinner removed", then "Dinner is back"', async () => {
    const { api } = routes()
    renderWithProviders(<MealSlotsPage />)
    await pressRemove(await openFromCard())
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Remove Dinner?' })).getByRole('button', { name: 'Remove Meal Slot' }))
    const toast = await findToast('Dinner removed')
    await userEvent.click(within(toast).getByRole('button', { name: 'Undo: put back Dinner' }))
    await findToast('Dinner is back')
    expect(api.callsTo('POST', '/api/meal-slots/restore')).toHaveLength(1)
    expect(api.callsTo('POST', '/api/meal-slots/restore')[0]!.body).toEqual({ ids: [601, 602, 603, 604, 605, 606, 607] })
    expect(await screen.findByRole('region', { name: 'Dinner' })).toBeInTheDocument()
  })
  it('a refused Undo of several days puts nothing back and names the days in the server\'s words', async () => {
    routes(ADMIN_ME, {
      'POST /api/meal-slots/restore': { status: 409, json: { error: { code: 'meal_slot_name_taken', message: 'There is already a Dinner on Monday and Wednesday.', ids: [601, 603], weekdays: [1, 3] } } },
    })
    renderWithProviders(<MealSlotsPage />)
    await pressRemove(await openFromCard())
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Remove Dinner?' })).getByRole('button', { name: 'Remove Meal Slot' }))
    await userEvent.click(within(await findToast('Dinner removed')).getByRole('button', { name: 'Undo: put back Dinner' }))
    const refused = await findToast('There is already a Dinner on Monday and Wednesday.')
    expect(refused).toHaveTextContent('Nothing was undone')
    expect(refused).toHaveTextContent('Rename or remove that Meal Slot first.')
  })
  it('some days ticked: "Remove Dinner on Mon, Tue and Wed?" and only those go', async () => {
    const { api } = routes()
    renderWithProviders(<MealSlotsPage />)
    const dinner = await screen.findByRole('region', { name: 'Dinner' })
    await userEvent.click(within(dinner).getByRole('button', { name: /^Dinner on Monday/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit Meal Slot' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Tuesday' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Wednesday' }))
    await pressRemove(sheet)
    const dialog = await screen.findByRole('dialog', { name: 'Remove Dinner on Mon, Tue and Wed?' })
    expect(within(dialog).getByText('Dinner stays on the other days.')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove Meal Slot' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/meal-slots/remove')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/meal-slots/remove')[0]!.body).toEqual({ ids: [601, 602, 603] })
    expect(await findToast('Dinner on Mon, Tue and Wed removed')).toBeInTheDocument()
  })
  it('unsaved edits in the sheet are dropped without "Discard changes?": the Remove confirm is the question', async () => {
    const { api } = routes()
    renderWithProviders(<MealSlotsPage />)
    const sheet = await openFromCard()
    await userEvent.type(within(sheet).getByLabelText('Name'), ' late')
    await pressRemove(sheet)
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Remove Dinner?' })).getByRole('button', { name: 'Remove Meal Slot' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/meal-slots/remove')).toHaveLength(1))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit Meal Slot' })).toBeNull())
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).toBeNull()
    expect(api.callsTo('PATCH', '/api/meal-slots/batch')).toHaveLength(0)
  })
})
