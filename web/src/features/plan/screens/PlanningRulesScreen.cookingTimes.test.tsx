// B9-51 (PC-14 and amendment A2): the "Cooking times" tile at the top of Planning rules: Earliest start and Latest start.
// Each is an on/off switch (Off is a real value) and, while on, our TimeField. An Admin saves with "Save Cooking times"; the save is
// PUT /api/household/settings with the whole settings (the server needs them) and the two fields changed. A plain User reads them.
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { findToast } from '../../../test/notices'
import { ADMIN_ME, mockApi, renderWithProviders, USER_ME } from '../../settings/test-utils'
import { PlanningRulesScreen } from './PlanningRulesScreen'

beforeAll(() => {
  // jsdom has no scrollIntoView; focusFirstInvalid scrolls the first invalid field into view before it focuses it.
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => vi.unstubAllGlobals())

const SETTINGS = {
  timeZone: 'Europe/Rome',
  timeZoneConfigured: true,
  planningHorizonDays: 7,
  defaultCooldownDays: 7,
  defaultLeftoverUseByDays: 3,
  quietHours: { start: '22:00', end: '07:00' },
  plannerStyle: 0.5,
  location: null,
  currency: 'EUR',
  earliestStart: '06:30' as string | null,
  latestStart: '22:00' as string | null,
}
const SLOTS = [
  { id: 1, weekday: 1, name: 'Breakfast', time: '08:30' },
  { id: 2, weekday: 1, name: 'Lunch', time: '13:00' },
  { id: 3, weekday: 1, name: 'Dinner', time: '19:00' },
]
const RECIPES = [
  { id: 1, name: 'Omelette', tags: [], totalMinutes: 10 },
  { id: 2, name: 'Slow cooker beef and barley stew', tags: [], totalMinutes: 360 },
]

type Call = { body?: unknown }
function setup(over: { settings?: Partial<typeof SETTINGS>; me?: unknown; put?: (c: Call) => unknown } = {}) {
  const state = { settings: { ...SETTINGS, ...over.settings } }
  const api = mockApi({
    'GET /api/me': over.me ?? ADMIN_ME,
    'GET /api/household/settings': () => state.settings,
    'PUT /api/household/settings': (c: Call) => (over.put ? over.put(c) : (state.settings = { ...state.settings, ...(c.body as object) })),
    'GET /api/slot-rules': [],
    'GET /api/variety-rules': [],
    'GET /api/meal-slots': SLOTS,
    'GET /api/recipes': RECIPES,
    'GET /api/tags': [],
  })
  renderWithProviders(<PlanningRulesScreen />, '/settings/planning')
  return api
}
const loaded = () => screen.findByRole('heading', { level: 2, name: 'Cooking times' })
const group = (name: 'Earliest start time' | 'Latest start time') => screen.getByRole('group', { name })
const sw = (name: 'Earliest start' | 'Latest start') => screen.getByRole('switch', { name })
const shown = (name: 'Earliest start time' | 'Latest start time') =>
  `${(within(group(name)).getByRole('spinbutton', { name: 'Hour' }) as HTMLInputElement).value}:${(within(group(name)).getByRole('spinbutton', { name: 'Minute' }) as HTMLInputElement).value}`
const typeTime = async (name: 'Earliest start time' | 'Latest start time', digits: string) => {
  await userEvent.click(within(group(name)).getByRole('spinbutton', { name: 'Hour' }))
  await userEvent.keyboard(digits)
}
const saveButton = () => screen.getByRole('button', { name: 'Save Cooking times' })
const putBody = (api: ReturnType<typeof setup>) => api.callsTo('PUT', '/api/household/settings')[0]?.body as Record<string, unknown>
/** The page's own alerts: the ToastProvider always mounts an empty alert live region (.toast-live). */
const pageAlerts = () => screen.queryAllByRole('alert').filter((el) => !el.classList.contains('toast-live'))

describe('Cooking times: what the tile shows', () => {
  it('is the first tile of Planning rules, before the Slot Rules and the Variety Rules', async () => {
    setup()
    await loaded()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Cooking times', 'Slot Rules', 'Variety Rules'])
  })

  it('says that Advance Steps the day before are not affected', async () => {
    setup()
    await loaded()
    expect(screen.getByText(/Advance Steps the day before are not affected/)).toBeInTheDocument()
  })

  it('shows the stored times, 06:30 and 22:00, with both switches on', async () => {
    setup()
    await loaded()
    await waitFor(() => expect(shown('Earliest start time')).toBe('06:30'))
    expect(shown('Latest start time')).toBe('22:00')
    expect(sw('Earliest start')).toBeChecked()
    expect(sw('Latest start')).toBeChecked()
  })

  it('Off is a stored value: a switch that is off and no time field', async () => {
    setup({ settings: { earliestStart: null, latestStart: null } })
    await loaded()
    await waitFor(() => expect(sw('Earliest start')).not.toBeChecked())
    expect(sw('Latest start')).not.toBeChecked()
    expect(screen.queryByRole('group', { name: 'Earliest start time' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Latest start time' })).toBeNull()
  })

  it('uses our TimeField and switches: no native time input, no native select', async () => {
    setup()
    await loaded()
    await waitFor(() => expect(shown('Earliest start time')).toBe('06:30'))
    expect(document.querySelector('input[type="time"], input[type="number"], select')).toBeNull()
  })
})

describe('Cooking times: the example line', () => {
  it('names the longest Recipe and the Meal Slots it can and cannot be planned for', async () => {
    setup()
    await loaded()
    expect(await screen.findByText('Slow cooker beef and barley stew (6 h) can be planned for Lunch at 13:00 or later, not for Breakfast.')).toBeInTheDocument()
  })

  it('follows the Earliest start as it is changed, before it is saved', async () => {
    setup()
    await loaded()
    await screen.findByText(/Lunch at 13:00 or later/)
    await typeTime('Earliest start time', '1100')
    expect(await screen.findByText('Slow cooker beef and barley stew (6 h) can be planned for Dinner at 19:00 or later, not for Breakfast or Lunch.')).toBeInTheDocument()
  })

  it('is left out when no Recipe has a total time', async () => {
    mockApi({
      'GET /api/me': ADMIN_ME,
      'GET /api/household/settings': SETTINGS,
      'GET /api/slot-rules': [],
      'GET /api/variety-rules': [],
      'GET /api/meal-slots': SLOTS,
      'GET /api/recipes': [{ id: 1, name: 'Soup', tags: [] }],
      'GET /api/tags': [],
    })
    renderWithProviders(<PlanningRulesScreen />, '/settings/planning')
    await loaded()
    await waitFor(() => expect(shown('Earliest start time')).toBe('06:30'))
    expect(screen.queryByText(/can be planned for/)).toBeNull()
  })
})

describe('Cooking times: saving (Admin)', () => {
  it('Save Cooking times is disabled until something changes', async () => {
    setup()
    await loaded()
    await waitFor(() => expect(shown('Earliest start time')).toBe('06:30'))
    expect(saveButton()).toBeDisabled()
    await typeTime('Earliest start time', '0700')
    expect(saveButton()).toBeEnabled()
  })

  it('a new Earliest start is sent with the Latest start and the rest of the settings, then a toast says so', async () => {
    const api = setup()
    await loaded()
    await waitFor(() => expect(shown('Earliest start time')).toBe('06:30'))
    await typeTime('Earliest start time', '0700')
    await userEvent.click(saveButton())
    await waitFor(() => expect(api.callsTo('PUT', '/api/household/settings')).toHaveLength(1))
    expect(putBody(api)).toMatchObject({ earliestStart: '07:00', latestStart: '22:00', timeZone: 'Europe/Rome', planningHorizonDays: 7, currency: 'EUR', plannerStyle: 0.5, quietHours: { start: '22:00', end: '07:00' } })
    expect(putBody(api)).not.toHaveProperty('timeZoneConfigured')
    await findToast('Cooking times saved')
    await waitFor(() => expect(saveButton()).toBeDisabled())
  })

  it('turning the Latest start Off and saving sends latestStart: null (an absent field would keep the old one)', async () => {
    const api = setup()
    await loaded()
    await waitFor(() => expect(shown('Latest start time')).toBe('22:00'))
    await userEvent.click(sw('Latest start'))
    expect(screen.queryByRole('group', { name: 'Latest start time' })).toBeNull()
    await userEvent.click(saveButton())
    await waitFor(() => expect(api.callsTo('PUT', '/api/household/settings')).toHaveLength(1))
    expect(putBody(api)).toMatchObject({ earliestStart: '06:30', latestStart: null })
  })

  it('turning the Earliest start Off sends earliestStart: null', async () => {
    const api = setup()
    await loaded()
    await waitFor(() => expect(shown('Earliest start time')).toBe('06:30'))
    await userEvent.click(sw('Earliest start'))
    await userEvent.click(saveButton())
    await waitFor(() => expect(api.callsTo('PUT', '/api/household/settings')).toHaveLength(1))
    expect(putBody(api)).toMatchObject({ earliestStart: null, latestStart: '22:00' })
  })

  it('turning a time Off and On again brings its last time back, and that is no change', async () => {
    setup({ settings: { latestStart: '21:30' } })
    await loaded()
    await waitFor(() => expect(shown('Latest start time')).toBe('21:30'))
    await userEvent.click(sw('Latest start'))
    await userEvent.click(sw('Latest start'))
    expect(shown('Latest start time')).toBe('21:30')
    expect(saveButton()).toBeDisabled()
  })

  it('a time that was Off comes back On at the default: 06:30 for the Earliest start, 22:00 for the Latest start', async () => {
    setup({ settings: { earliestStart: null, latestStart: null } })
    await loaded()
    await waitFor(() => expect(sw('Earliest start')).not.toBeChecked())
    await userEvent.click(sw('Earliest start'))
    await userEvent.click(sw('Latest start'))
    expect(shown('Earliest start time')).toBe('06:30')
    expect(shown('Latest start time')).toBe('22:00')
  })
})

describe('Cooking times: errors at the field (SAFE-04)', () => {
  it('a Latest start that is not later than the Earliest start is refused before any request, under the Latest start field, and focus goes there', async () => {
    const api = setup()
    await loaded()
    await waitFor(() => expect(shown('Earliest start time')).toBe('06:30'))
    await typeTime('Earliest start time', '2300')
    fireEvent.submit(saveButton().closest('form')!)
    expect(api.callsTo('PUT', '/api/household/settings')).toHaveLength(0)
    const latest = group('Latest start time')
    expect(latest).toHaveAttribute('aria-invalid', 'true')
    expect(latest).toHaveAccessibleDescription(expect.stringContaining('Latest start must be later than Earliest start.'))
    expect(within(latest).getByRole('spinbutton', { name: 'Hour' })).toHaveFocus()
    expect(pageAlerts()).toHaveLength(0)
    expect(saveButton()).toBeEnabled()
  })

  it('the error goes when the field is fixed', async () => {
    setup()
    await loaded()
    await waitFor(() => expect(shown('Earliest start time')).toBe('06:30'))
    await typeTime('Earliest start time', '2300')
    fireEvent.submit(saveButton().closest('form')!)
    await waitFor(() => expect(group('Latest start time')).toHaveAttribute('aria-invalid', 'true'))
    await userEvent.click(sw('Latest start')) // Off: nothing to compare
    expect(screen.queryByRole('group', { name: 'Latest start time' })).toBeNull()
    expect(pageAlerts()).toHaveLength(0)
  })

  it('a 422 on latestStart from the server lands at the Latest start field too, with focus on it', async () => {
    setup({ put: () => ({ status: 422, json: { error: { code: 'validation_failed', message: 'must be later than the Earliest start', field: 'latestStart' } } }) })
    await loaded()
    await waitFor(() => expect(shown('Earliest start time')).toBe('06:30'))
    await typeTime('Earliest start time', '0700')
    await userEvent.click(saveButton())
    await waitFor(() => expect(group('Latest start time')).toHaveAttribute('aria-invalid', 'true'))
    expect(group('Latest start time')).toHaveAccessibleDescription(/\S/)
    expect(within(group('Latest start time')).getByRole('spinbutton', { name: 'Hour' })).toHaveFocus()
    expect(pageAlerts()).toHaveLength(0)
  })

  it('a failure that belongs to no field is the tile\'s one alert (FormError) and nothing is marked invalid', async () => {
    setup({ put: () => ({ status: 500, json: { error: { code: 'internal', message: 'boom' } } }) })
    await loaded()
    await waitFor(() => expect(shown('Earliest start time')).toBe('06:30'))
    await typeTime('Earliest start time', '0700')
    await userEvent.click(saveButton())
    await waitFor(() => expect(pageAlerts()).toHaveLength(1))
    expect(pageAlerts()[0]!.closest('section')).toContainElement(screen.getByRole('heading', { name: 'Cooking times' }))
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull()
  })
})

describe('Cooking times: a plain User', () => {
  it('reads the times; the switches and the time fields are disabled; there is no Save; it says only an Admin changes them', async () => {
    setup({ me: USER_ME })
    await loaded()
    await waitFor(() => expect(shown('Earliest start time')).toBe('06:30'))
    expect(sw('Earliest start')).toBeDisabled()
    expect(sw('Latest start')).toBeDisabled()
    for (const n of ['Hour', 'Minute']) expect(within(group('Earliest start time')).getByRole('spinbutton', { name: n })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save Cooking times' })).toBeNull()
    expect(screen.getByText(/Only an Admin can change/)).toBeInTheDocument()
  })

  it('still edits Slot Rules and Variety Rules (any User may, spec 2)', async () => {
    setup({ me: USER_ME })
    await loaded()
    expect(await screen.findByRole('button', { name: 'Add Slot Rule' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Save Variety Rule' })).toBeEnabled()
  })
})
