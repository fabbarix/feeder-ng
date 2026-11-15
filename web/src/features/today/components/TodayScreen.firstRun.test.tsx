// B9-53 (TB-06): first run through the real TodayScreen, setupSeam and setupActions, on a fetch stub that remembers what was written. BDD names covered here:
// "Looks right saves the device time zone and currency", "Add a Member opens the Member sheet on Today", "Create 2 Meal Slots makes Lunch and Dinner every day",
// "Hide for now hides it until shown again from Settings" (the Today half). The API halves are bdd/features/household/first_run.feature.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findToast } from '../../../test/notices'
import { ADMIN_ME, mockApi, renderWithProviders, USER_ME } from '../../settings/test-utils'
import { settings } from '../../../test/setupFacts'
import { TodayScreen } from './TodayScreen'

vi.mock('../seams', () => ({
  useScanSessionActive: () => false,
  useTodayPlan: () => ({ hasNextMeal: false, toConfirm: 0, couldntPlan: 0, leftovers: 0, loading: false, failed: false }),
  useTodayStock: () => ({ spoiled: 0, useSoon: [], loading: false }),
  useTodayTileData: () => ({
    now: new Date(), nextSlot: null, toConfirm: [], couldntPlan: [], leftovers: [], planToday: '2026-11-14', loadFailed: false, spoiled: [], stockToday: '2026-11-14',
    system: 'metric', useSoon: [], throwOut: vi.fn(), keep: vi.fn(), spoiledCalls: { throwOut: vi.fn(), keep: vi.fn(), undoThrowOut: vi.fn(), undoKeep: vi.fn() }, planLoading: false, stockLoading: false,
  }),
}))
vi.mock('../shoppingSeam', () => ({ useShoppingSession: () => null }))
vi.mock('../../../app/useHouseholdDate', () => ({ useHouseholdDate: () => '2026-11-14' }))
vi.mock('../lib/currencyGuess', async (orig) => ({ ...(await orig<typeof import('../lib/currencyGuess')>()), detectDevice: () => ({ timeZone: 'Europe/Rome', locale: 'it-IT' }) }))

interface World {
  settings: Record<string, unknown>
  members: { id: number; name: string }[]
  slots: Record<string, unknown>[]
  recipes: unknown[]
  plan: unknown[]
}
let w: World
beforeEach(() => {
  w = { settings: settings(), members: [], slots: [], recipes: [], plan: [] }
})
afterEach(() => vi.unstubAllGlobals())

function mount(me = ADMIN_ME) {
  const api = mockApi({
    'GET /api/me': me,
    'GET /api/household/settings': () => w.settings,
    'PUT /api/household/settings': (c: { body: Record<string, unknown> }) => {
      w.settings = { ...w.settings, ...c.body, timeZoneConfigured: true }
      return w.settings
    },
    'GET /api/members': () => w.members,
    'POST /api/members': (c: { body: { name: string } }) => {
      const m = { id: w.members.length + 1, ...c.body, colour: '#336', avatar: '', portionFactor: 1, userId: null, email: null }
      w.members = [...w.members, m]
      return { status: 201, json: m }
    },
    'GET /api/users': [],
    'GET /api/allowlist': [],
    'GET /api/meal-slots': () => w.slots,
    'POST /api/meal-slots/batch': (c: { body: { slots: { name: string; time: string; weekdays: number[] }[] } }) => {
      let id = 1
      w.slots = c.body.slots.flatMap((s) => s.weekdays.map((weekday) => ({ id: id++, weekday, name: s.name, time: s.time, portionsNeeded: 1, attendance: w.members.map((m) => ({ memberId: m.id, portionFactorOverride: null })) })))
      return { status: 201, json: { created: w.slots } }
    },
    'GET /api/recipes': () => w.recipes,
    'GET /api/plan': () => ({ today: '2026-11-14', horizonDays: 7, updating: false, slots: w.plan }),
    'GET /api/today/advance-steps': { steps: [] },
    'GET /api/today/streak': { days: 0 },
  })
  renderWithProviders(createElement(TodayScreen))
  return api
}
const tile = () => screen.findByRole('region', { name: 'Set up your Household' })
const putBodies = (api: ReturnType<typeof mockApi>) => api.callsTo('PUT', '/api/household/settings').map((c) => c.body as Record<string, unknown>)

describe('first run on Today: an empty Household', () => {
  it('leads with the setup tile, whose current step is time zone and currency with the detected values', async () => {
    mount()
    const t = await tile()
    expect(within(t).getByText('Europe/Rome')).toBeInTheDocument()
    expect(within(t).getByText('Euro (€)')).toBeInTheDocument()
    expect(within(t).getByText('From this device', { exact: false })).toBeInTheDocument()
    expect(within(t).getByText('From Italy')).toBeInTheDocument()
    expect(within(t).getByRole('button', { name: 'Looks right' })).toBeInTheDocument()
    expect(document.querySelector('[data-tile="setup"]')).toBe(t.closest('[data-tile]'))
  })

  it('Looks right saves the device time zone and currency, toasts, and moves focus to "Add a Member" with "Step 1 of 5 done."', async () => {
    const api = mount()
    await userEvent.click(within(await tile()).getByRole('button', { name: 'Looks right' }))
    await waitFor(() => expect(putBodies(api)).toHaveLength(1))
    expect(putBodies(api)[0]).toMatchObject({ timeZone: 'Europe/Rome', currency: 'EUR' })
    await findToast('Time zone and currency saved.')
    const add = await within(await tile()).findByRole('button', { name: 'Add a Member' })
    await waitFor(() => expect(add).toHaveFocus())
    expect(within(await tile()).getByRole('status')).toHaveTextContent('Step 1 of 5 done.')
    expect(within(await tile()).getByText('Europe/Rome · Euro (€)')).toBeInTheDocument()
  })

  it('Change time zone opens a dialog named "Time zone" over Today, and closing it returns focus to the Change button', async () => {
    mount()
    const change = within(await tile()).getByRole('button', { name: 'Change time zone' })
    await userEvent.click(change)
    const dialog = await screen.findByRole('dialog', { name: 'Time zone' })
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: /^Close/ }))
    await waitFor(() => expect(change).toHaveFocus())
  })

  it('Add a Member opens the Member sheet on Today (no navigation) with the caption; Save and add another keeps it open', async () => {
    w.settings = settings({ timeZoneConfigured: true, timeZone: 'Europe/Rome', currency: 'EUR' })
    const api = mount()
    await userEvent.click(within(await tile()).getByRole('button', { name: 'Add a Member' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Set up · step 2 of 5 · no Members yet')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Anna')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save and add another' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/members')).toHaveLength(1))
    expect(await within(screen.getByRole('dialog')).findByText('Set up · step 2 of 5 · 1 Member so far')).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByLabelText('Name')).toHaveValue('')
  })

  it('Save closes the sheet, the step shows "2 Members: Anna, Ben" and focus goes to the next step\'s primary', async () => {
    w.settings = settings({ timeZoneConfigured: true })
    mount()
    await userEvent.click(within(await tile()).getByRole('button', { name: 'Add a Member' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Anna')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save and add another' }))
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByLabelText('Name')).toHaveValue(''))
    await userEvent.type(within(screen.getByRole('dialog')).getByLabelText('Name'), 'Ben')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await within(await tile()).findByText('2 Members: Anna, Ben')).toBeInTheDocument()
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Set up your Household' })).getByRole('button', { name: 'Set up Meal Slots' })).toHaveFocus())
  })

  it('closing the Member sheet with nothing saved returns focus to "Add a Member"', async () => {
    w.settings = settings({ timeZoneConfigured: true })
    mount()
    const add = within(await tile()).getByRole('button', { name: 'Add a Member' })
    await userEvent.click(add)
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^Close/ }))
    await waitFor(() => expect(add).toHaveFocus())
  })

  it('Create 2 Meal Slots makes Lunch and Dinner every day through one batch', async () => {
    w.settings = settings({ timeZoneConfigured: true })
    w.members = [{ id: 1, name: 'Anna' }, { id: 2, name: 'Ben' }]
    const api = mount()
    await userEvent.click(within(await tile()).getByRole('button', { name: 'Set up Meal Slots' }))
    const dialog = await screen.findByRole('dialog', { name: 'When do you eat?' })
    expect(within(dialog).getByText('At the table: Anna, Ben')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create 2 Meal Slots' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/meal-slots/batch')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/meal-slots/batch')[0]!.body).toEqual({
      slots: [{ name: 'Lunch', time: '13:00', weekdays: [1, 2, 3, 4, 5, 6, 7] }, { name: 'Dinner', time: '19:30', weekdays: [1, 2, 3, 4, 5, 6, 7] }],
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await within(await tile()).findByText('Lunch, Dinner, every day. Everyone attends.')).toBeInTheDocument()
  })

  it('step 4 shows "0 of 5 Recipes" with the three ways, and no link to a list page', async () => {
    w.settings = settings({ timeZoneConfigured: true })
    w.members = [{ id: 1, name: 'Anna' }]
    w.slots = [{ id: 1, weekday: 1, name: 'Dinner', time: '19:30', portionsNeeded: 1, attendance: [{ memberId: 1, portionFactorOverride: null }] }]
    mount()
    const t = await tile()
    expect(await within(t).findByText('0 of 5 Recipes')).toBeInTheDocument()
    expect(within(t).getAllByRole('button').map((b) => b.textContent!.trim().split(/\s{2,}/)[0])).toEqual(expect.arrayContaining([expect.stringMatching(/^New Recipe/), expect.stringMatching(/^Read a recipe/), expect.stringMatching(/^Import Recipes/)]))
    expect(within(t).queryAllByRole('link')).toHaveLength(0)
  })
})

describe('first run on Today: after the first plan', () => {
  const planned = () => {
    w.settings = settings({ timeZoneConfigured: true, timeZone: 'Europe/Rome', currency: 'EUR' })
    w.members = [{ id: 1, name: 'Anna' }, { id: 2, name: 'Ben' }]
    w.slots = [{ id: 1, weekday: 1, name: 'Dinner', time: '19:30', portionsNeeded: 2, attendance: [{ memberId: 1, portionFactorOverride: null }, { memberId: 2, portionFactorOverride: null }] }]
    w.recipes = [{ id: 1 }]
    w.plan = [{ courses: [{ meal: { recipeName: 'Soup', state: 'planned' } }] }]
  }

  it('the checklist stays, compact, with 1 of 5 Recipes (it does not vanish with the first plan)', async () => {
    planned()
    mount()
    const t = await tile()
    expect(t).toHaveTextContent('Add 4 more Recipes and the planner has more to choose from. 1 of 5 so far.')
  })

  it('at five Recipes it is gone', async () => {
    planned()
    w.recipes = [1, 2, 3, 4, 5].map((id) => ({ id }))
    mount()
    await waitFor(() => expect(document.querySelector('.today__grid, .today')).not.toBeNull())
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('region', { name: 'Set up your Household' })).toBeNull()
  })

  it('Hide for now hides it with an Undo toast, and Undo brings it back', async () => {
    planned()
    const api = mount()
    await userEvent.click(within(await tile()).getByRole('button', { name: 'Hide for now' }))
    await waitFor(() => expect(putBodies(api)[0]).toMatchObject({ setupHidden: true }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Set up your Household' })).toBeNull())
    const toast = await findToast('Setup checklist hidden')
    await userEvent.click(within(toast).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(putBodies(api)[1]).toMatchObject({ setupHidden: false }))
    expect(await tile()).toBeInTheDocument()
  })

  it('a Household that the upgrade hid (setupHidden, a plan, 3 Recipes) does not show it', async () => {
    planned()
    w.recipes = [1, 2, 3].map((id) => ({ id }))
    w.settings = settings({ timeZoneConfigured: true, setupHidden: true })
    mount()
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('region', { name: 'Set up your Household' })).toBeNull()
  })
})

describe('first run on Today: a plain User', () => {
  it('sees "Ask an Admin to do this." and no Members, Meal Slots or time zone button', async () => {
    mount(USER_ME as never)
    const t = await tile()
    expect(within(t).getAllByText('Ask an Admin to do this.')).toHaveLength(3)
    expect(within(t).queryByRole('button', { name: 'Looks right' })).toBeNull()
    expect(within(t).queryByRole('button', { name: 'Add a Member' })).toBeNull()
  })
})
