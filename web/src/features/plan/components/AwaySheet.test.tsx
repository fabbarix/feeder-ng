// B9-46 (PC-08): the Away sheet. Opened from a Meal Slot ("Someone is away…", Who pills), from the Member sheet (the Member is fixed) or to
// edit an Away. Our own DateField (never a native date input), Meal Slot selects under it, a "No last day yet" switch, a collapsed
// "What changes" disclosure from the dry run (debounced), field errors at the field, one Cancel and no Close, and a toast with Undo.
// Household today: Sun 15 Nov 2026; the plan runs to Sat 21. Tue 17 is the day the sheet opens on.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { mockApi, newQueryClient } from '../../settings/test-utils'
import type { Away, AwayPreview } from '../types'
import { AwaySheet, type AwaySheetProps } from './AwaySheet'

// jsdom has no scrollIntoView; useFocusFirstInvalid scrolls the first invalid field into view.
beforeAll(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const member = (id: number, name: string) => ({ id, name, colour: '#3366cc', avatar: '', portionFactor: 1, userId: null, email: null })
const MEMBERS = [member(1, 'Anna'), member(2, 'Ben'), member(3, 'Chiara')]
const SLOTS = [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) =>
  [['Breakfast', '08:30', 1], ['Lunch', '13:00', 2], ['Dinner', '19:00', 3]].map(([name, time, n]) => ({
    id: weekday * 10 + (n as number), weekday, name, time, attendance: [], portionsNeeded: 3,
  })),
)
const PLAN = { today: '2026-11-15', horizonDays: 7, updating: false, slots: [{ date: '2026-11-21', mealSlotId: 63, name: 'Dinner', time: '19:00', at: '2026-11-21T19:00:00Z', portions: 3, rules: [] }], away: [] }
const slot = (mealSlotId: number, mealSlotName: string, before: number, after: number) => ({ mealSlotId, mealSlotName, time: '19:00', portionsBefore: before, portionsAfter: after, changes: before !== after, back: false })
const PREVIEW: AwayPreview = {
  slotsWithout: 9, mealsChanged: 6, beyondHorizon: null,
  days: [
    { date: '2026-11-17', slots: [slot(21, 'Breakfast', 2.75, 1.75), slot(22, 'Lunch', 2.75, 1.75), slot(23, 'Dinner', 2.75, 1.75)] },
    { date: '2026-11-18', slots: [slot(31, 'Breakfast', 1.75, 1.75), slot(32, 'Lunch', 1.75, 1.75), slot(33, 'Dinner', 2.75, 1.75)] },
    { date: '2026-11-19', slots: [slot(41, 'Breakfast', 1.75, 1.75), slot(42, 'Lunch', 2.75, 1.75), slot(43, 'Dinner', 2.75, 1.75)] },
  ],
}
const ben = (over: Partial<Away> = {}): Away => ({ id: 9, memberId: 2, memberName: 'Ben', from: '2026-11-17', fromMealSlotId: null, through: '2026-11-19', throughMealSlotId: null, started: false, ...over })
const base = {
  'GET /api/members': MEMBERS,
  'GET /api/meal-slots': SLOTS,
  'GET /api/plan': PLAN,
  'GET /api/members/2/away': [],
}

function mount(props: Partial<AwaySheetProps> = {}) {
  const onClose = vi.fn()
  const view = render(
    <QueryClientProvider client={newQueryClient()}>
      <ToastProvider>
        <ConfirmProvider>
          <MemoryRouter>
            <AwaySheet open onClose={onClose} {...props} />
          </MemoryRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )
  return { onClose, ...view }
}
const dialog = () => screen.findByRole('dialog')
const sheet = async () => within(await dialog())
const dayCell = (iso: string) => document.querySelector<HTMLButtonElement>(`[data-iso="${iso}"]`)!
const toast = () => document.querySelector<HTMLElement>('.toast')!
/** A Member of the Who pills. */
const who = async (name: string) => userEvent.click(within(await screen.findByRole('radiogroup', { name: 'Who' })).getByRole('radio', { name }))

describe('AwaySheet: opened from a Meal Slot', () => {
  it('"Someone is away" under "From Tue 17 Dinner", the Who pills with nobody chosen, Cancel and Save Away, no Close', async () => {
    mockApi(base)
    mount({ from: { date: '2026-11-17', mealSlotId: 23 } })
    const d = await sheet()
    expect(await screen.findByRole('dialog', { name: /Someone is away/ })).toBeInTheDocument()
    expect(document.querySelector('.sheet__context')).toHaveTextContent('From Tue 17 Dinner')
    const pills = await screen.findByRole('radiogroup', { name: 'Who' })
    // B9-46 developer: each pill shows the Member's Avatar, whose initials are text, so the pills are compared by their names.
    expect(within(pills).getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(['Anna', 'Ben', 'Chiara'])
    expect(within(pills).queryByRole('radio', { checked: true })).toBeNull()
    expect(d.queryByRole('button', { name: 'Close' })).toBeNull()
    expect(d.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(d.getByRole('button', { name: 'Save Away' })).toBeDisabled()
  })

  it('choosing Ben names him in the context line and shows First day, From, Last day and Through', async () => {
    mockApi(base)
    mount({ from: { date: '2026-11-17', mealSlotId: 23 } })
    await who('Ben')
    expect(document.querySelector('.sheet__context')).toHaveTextContent('Ben · from Tue 17 Dinner')
    const d = await sheet()
    expect(d.getByRole('button', { name: /First day/ })).toHaveTextContent('17 Nov 2026')
    expect(d.getByRole('combobox', { name: /From/ })).toHaveTextContent('Dinner')
    expect(d.getByRole('button', { name: /Last day/ })).toHaveTextContent('17 Nov 2026')
    expect(d.getByRole('combobox', { name: /Through/ })).toHaveTextContent('Dinner (whole day)')
    expect(d.getByRole('button', { name: 'Save Away' })).toBeEnabled()
    expect(d.queryByRole('textbox', { name: /day/i })).toBeNull() // no native date input
    expect(document.querySelector('input[type="date"]')).toBeNull()
  })

  it('the From select offers the whole day first, then the day\'s Meal Slots', async () => {
    mockApi(base)
    mount({ from: { date: '2026-11-17', mealSlotId: 23 } })
    await who('Ben')
    await userEvent.click((await sheet()).getByRole('combobox', { name: /From/ }))
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Breakfast (whole day)', 'Lunch', 'Dinner'])
  })
})

describe('AwaySheet: opened from the Member sheet', () => {
  it('the title names the Member, the context says "New Away", and there are no Who pills', async () => {
    mockApi(base)
    mount({ memberId: 2 })
    expect(await screen.findByRole('dialog', { name: /Ben is away/ })).toBeInTheDocument()
    expect(document.querySelector('.sheet__context')).toHaveTextContent('New Away')
    expect(screen.queryByRole('radiogroup', { name: 'Who' })).toBeNull()
    expect(await screen.findByRole('button', { name: /First day/ })).toHaveTextContent('15 Nov 2026')
  })
})

describe('AwaySheet: No last day yet', () => {
  it('hides Last day and Through, and says Ben stays away until it is ended', async () => {
    mockApi({ ...base, 'POST /api/members/2/away?dryRun=1': PREVIEW })
    mount({ memberId: 2 })
    const d = await sheet()
    await userEvent.click(await d.findByRole('switch', { name: 'No last day yet' }))
    expect(d.queryByRole('button', { name: /Last day/ })).toBeNull()
    expect(d.queryByRole('combobox', { name: /Through/ })).toBeNull()
    expect(d.getByText('Ben stays away until you end it.')).toBeInTheDocument()
  })
})

describe('AwaySheet: What changes', () => {
  it('is a collapsed disclosure; its summary row follows the dry run, and "Checking the plan…" shows meanwhile', async () => {
    let release: (v: unknown) => void = () => {}
    const pending = new Promise((r) => (release = r))
    const api = mockApi({ ...base, 'POST /api/members/2/away?dryRun=1': () => pending })
    mount({ memberId: 2, from: { date: '2026-11-17', mealSlotId: 21 } })
    expect(await screen.findByText('Checking the plan…', {}, { timeout: 3000 })).toBeInTheDocument()
    release({ json: PREVIEW })
    const summary = await screen.findByText('9 Meal Slots without Ben · 6 meals change')
    // Ruling 1 (main session): the shared ui Disclosure, not a bare <details>: closed is the toggle's aria-expanded="false".
    const details = summary.closest('[data-disclosure]')!
    expect(within(details as HTMLElement).getByRole('button', { expanded: false })).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/members/2/away?dryRun=1')[0]!.body).toEqual({ from: '2026-11-17', fromMealSlotId: null, through: '2026-11-17', throughMealSlotId: null })
  })

  it('opened, it holds R-E rows (a list, no free-text bullets): the day, its count, the detail', async () => {
    mockApi({ ...base, 'POST /api/members/2/away?dryRun=1': PREVIEW })
    mount({ memberId: 2 })
    const summary = await screen.findByText('9 Meal Slots without Ben · 6 meals change')
    await userEvent.click(summary)
    const details = summary.closest<HTMLElement>('[data-disclosure]')!
    expect(within(details).getByRole('button', { expanded: true })).toBeInTheDocument()
    const rows = within(details).getAllByRole('listitem')
    expect(rows.map((r) => r.querySelector('.detail-row__label')?.textContent)).toEqual(['Tue 17', 'Wed 18', 'Thu 19', 'Unchanged'])
    expect(rows[0]!.querySelector('.detail-row__state')).toHaveTextContent('3 meals')
    expect(rows[0]!.querySelector('.detail-row__detail')).toHaveTextContent('Breakfast, Lunch, Dinner · 2.75 → 1.75 portions')
    expect(details.querySelector('li:not(.detail-row)')).toBeNull()
  })

  it('an Away past the plan says nothing in this week changes, and from when the planner leaves Ben out', async () => {
    mockApi({ ...base, 'POST /api/members/2/away?dryRun=1': { slotsWithout: 0, mealsChanged: 0, days: [], beyondHorizon: '2026-12-01' } })
    mount({ memberId: 2 })
    const summary = await screen.findByText("Nothing in this week's plan changes")
    await userEvent.click(summary)
    expect(within(summary.closest<HTMLElement>('[data-disclosure]')!).getByText('The plan runs to Sat 21. From Tue 1 Dec the planner plans without Ben.')).toBeInTheDocument()
  })
})

describe('AwaySheet: saving a new Away', () => {
  it('POSTs the Away, closes, and says "Ben is away" with the span, the changed meals, Review only when there are changes, and Undo', async () => {
    const api = mockApi({
      ...base,
      'POST /api/members/2/away?dryRun=1': PREVIEW,
      'POST /api/members/2/away': { status: 201, json: { ...ben(), changes: [], undoToken: 'tok-1' } },
      'POST /api/plan/restore': {},
    })
    const { onClose } = mount({ memberId: 2, from: { date: '2026-11-17', mealSlotId: 21 } })
    const d = await sheet()
    await userEvent.click(await d.findByRole('button', { name: /Last day/ }))
    await userEvent.click(dayCell('2026-11-19'))
    await screen.findByText('9 Meal Slots without Ben · 6 meals change')
    await userEvent.click(d.getByRole('button', { name: 'Save Away' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(api.callsTo('POST', '/api/members/2/away')[0]!.body).toEqual({ from: '2026-11-17', fromMealSlotId: null, through: '2026-11-19', throughMealSlotId: null })
    const t = toast()
    expect(t.querySelector('.toast__title-text')).toHaveTextContent('Ben is away')
    expect(t.querySelector('.toast__title svg')).toBeNull() // no icon (R-D+)
    expect(t.querySelector('.toast__subline')).toHaveTextContent('Tue 17 Breakfast – Thu 19 Dinner')
    expect(t.querySelector('.toast__body')).toHaveTextContent('6 meals changed to 1.75 portions: Tue Breakfast, Lunch and Dinner; Wed Dinner; Thu Lunch and Dinner.')
    expect(within(t).queryByRole('button', { name: /Review/ })).toBeNull()
    await userEvent.click(within(t).getByRole('button', { name: 'Undo: Ben is away' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/restore')[0]!.body).toEqual({ undoToken: 'tok-1' }))
  })

  it('a write that moved other meals offers Review', async () => {
    const change = { date: '2026-11-17', mealSlotId: 23, courseId: 1, before: { recipeId: 1, recipeName: 'Lasagne', servedFromLeftover: false }, after: { recipeId: 2, recipeName: 'Soup', servedFromLeftover: false }, why: [] }
    mockApi({
      ...base,
      'POST /api/members/2/away?dryRun=1': PREVIEW,
      'POST /api/members/2/away': { status: 201, json: { ...ben(), changes: [change], undoToken: 'tok-1' } },
    })
    const { onClose } = mount({ memberId: 2 })
    await screen.findByText('9 Meal Slots without Ben · 6 meals change')
    await userEvent.click((await sheet()).getByRole('button', { name: 'Save Away' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(within(toast()).getByRole('button', { name: /Review/ })).toBeInTheDocument()
  })

  it('a refusal stays at its field: the overlap message under Last day, focus on it, the sheet stays open', async () => {
    const message = 'Ben is already away Fri 20 – Sun 22 Nov. Change that Away instead.'
    mockApi({
      ...base,
      'POST /api/members/2/away?dryRun=1': PREVIEW,
      'POST /api/members/2/away': { status: 422, json: { error: { code: 'validation_failed', message, field: 'from', reason: 'overlap' } } },
    })
    const { onClose } = mount({ memberId: 2 })
    await screen.findByText('9 Meal Slots without Ben · 6 meals change')
    const d = await sheet()
    await userEvent.click(d.getByRole('button', { name: 'Save Away' }))
    const last = await d.findByRole('button', { name: /Last day/ })
    await waitFor(() => expect(last).toHaveAccessibleDescription(message))
    expect(last).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(last).toHaveFocus())
    expect(onClose).not.toHaveBeenCalled()
    expect(document.querySelector('.toast')).toBeNull()
  })

  it('a first day in the past is refused at First day', async () => {
    mockApi({
      ...base,
      'POST /api/members/2/away?dryRun=1': PREVIEW,
      'POST /api/members/2/away': { status: 422, json: { error: { code: 'validation_failed', message: 'The first day cannot be in the past.', field: 'from', reason: 'first_day_past' } } },
    })
    mount({ memberId: 2 })
    await screen.findByText('9 Meal Slots without Ben · 6 meals change')
    const d = await sheet()
    await userEvent.click(d.getByRole('button', { name: 'Save Away' }))
    const first = await d.findByRole('button', { name: /First day/ })
    await waitFor(() => expect(first).toHaveAccessibleDescription('The first day cannot be in the past.'))
  })
})

describe('AwaySheet: editing an Away', () => {
  it('a coming Away: "Ben is away" under its range; Save and "Remove Away 17–19 Nov for Ben"', async () => {
    mockApi({ ...base, 'PATCH /api/away/9?dryRun=1': PREVIEW })
    mount({ away: ben() })
    expect(await screen.findByRole('dialog', { name: /Ben is away/ })).toBeInTheDocument()
    expect(document.querySelector('.sheet__context')).toHaveTextContent('Tue 17 – Thu 19 Nov')
    const d = await sheet()
    expect(d.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(d.getByRole('button', { name: 'Remove Away 17–19 Nov for Ben' })).toBeInTheDocument()
    expect(d.queryByRole('button', { name: /End today/ })).toBeNull()
    expect(d.queryByRole('button', { name: 'Close' })).toBeNull()
    expect(d.queryByRole('radiogroup', { name: 'Who' })).toBeNull()
  })

  it('removing is a light removal: no confirm, an Undo toast without an icon, and Undo brings it back', async () => {
    const api = mockApi({
      ...base,
      'PATCH /api/away/9?dryRun=1': PREVIEW,
      'DELETE /api/away/9': { json: { id: 9, changes: [], undoToken: 'tok-2' } },
      'POST /api/plan/restore': {},
    })
    const { onClose } = mount({ away: ben() })
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Away 17–19 Nov for Ben' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(api.callsTo('DELETE', '/api/away/9')).toHaveLength(1)
    const t = toast()
    expect(t.querySelector('.toast__title-text')).toHaveTextContent("Ben's Away removed")
    expect(t.querySelector('.toast__title svg')).toBeNull()
    await userEvent.click(within(t).getByRole('button', { name: "Undo: Ben's Away removed" }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/restore')[0]!.body).toEqual({ undoToken: 'tok-2' }))
    expect(await screen.findByText("Ben's Away is back")).toBeInTheDocument()
  })

  it('a running Away cannot move its first day; it is ended, not removed: "End today: Away 17–19 Nov for Ben"', async () => {
    const api = mockApi({
      ...base,
      'PATCH /api/away/9?dryRun=1': PREVIEW,
      'POST /api/away/9/end': { json: { ...ben({ started: true, from: '2026-11-15', through: '2026-11-15', throughMealSlotId: 22 }), changes: [], undoToken: 'tok-3' } },
    })
    const { onClose } = mount({ away: ben({ from: '2026-11-15', started: true }) })
    const d = await sheet()
    expect(d.getByRole('button', { name: /First day/ })).toBeDisabled()
    expect(d.getByRole('combobox', { name: /From/ })).toBeDisabled()
    expect(d.queryByRole('button', { name: /Remove Away/ })).toBeNull()
    await userEvent.click(d.getByRole('button', { name: 'End today: Away 15–19 Nov for Ben' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(api.callsTo('POST', '/api/away/9/end')).toHaveLength(1)
    expect(toast().querySelector('.toast__title-text')).toHaveTextContent("Ben's Away ended")
    expect(toast().querySelector('.toast__subline')).toHaveTextContent('Back from Dinner today')
  })

  it('Save PATCHes the changes: turning on "No last day yet" clears the last day', async () => {
    const api = mockApi({
      ...base,
      'PATCH /api/away/9?dryRun=1': PREVIEW,
      'PATCH /api/away/9': { json: { ...ben({ through: null }), changes: [], undoToken: 'tok-4' } },
    })
    const { onClose } = mount({ away: ben() })
    const d = await sheet()
    await userEvent.click(await d.findByRole('switch', { name: 'No last day yet' }))
    await userEvent.click(d.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(api.callsTo('PATCH', '/api/away/9')[0]!.body).toEqual({ from: '2026-11-17', fromMealSlotId: null, through: null, throughMealSlotId: null })
    expect(toast().querySelector('.toast__title-text')).toHaveTextContent("Ben's Away changed")
  })

  it('an overlap found by the dry run shows at once, before saving', async () => {
    const message = 'Ben is already away Fri 20 – Sun 22 Nov. Change that Away instead.'
    mockApi({ ...base, 'PATCH /api/away/9?dryRun=1': { status: 422, json: { error: { code: 'validation_failed', message, field: 'from', reason: 'overlap' } } } })
    mount({ away: ben({ through: '2026-11-22' }) })
    const last = await (await sheet()).findByRole('button', { name: /Last day/ })
    await waitFor(() => expect(last).toHaveAccessibleDescription(message))
  })
})
