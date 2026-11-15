// B9-51 (SAFE-04, SAFE-02, SET-14d): the rule forms and the rule removals of Planning rules.
//  - A form that fails validation marks the field (aria-invalid, its message through aria-describedby), moves focus to the first invalid
//    field and keeps its submit button enabled. Field errors are not alerts; a server error with no field is the form's one FormError.
//  - Removing a Slot Rule or a Variety Rule acts at once (no confirm) and shows "<rule> removed" with Undo, which puts the rule back by
//    the inverse call. The Remove buttons say which rule they remove.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { findToast } from '../../../test/notices'
import { mockApi, renderWithProviders } from '../test-utils'
import { PlanningRulesScreen } from './PlanningRulesScreen'

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn() // jsdom has none; focusFirstInvalid scrolls the field into view
})
afterEach(() => vi.unstubAllGlobals())

const base = {
  'GET /api/me': { id: 1, email: 'admin@example.test', displayName: 'Admin', isAdmin: true },
  'GET /api/household/settings': { timeZone: 'UTC', timeZoneConfigured: true, planningHorizonDays: 7, defaultCooldownDays: 7, defaultLeftoverUseByDays: 3, quietHours: { start: '22:00', end: '07:00' }, plannerStyle: 0.5, location: null, currency: 'EUR', earliestStart: '06:30', latestStart: '22:00' },
  'GET /api/slot-rules': [
    { id: 9, mealSlotId: 5, tag: 'pizza' },
    { id: 11, mealSlotId: 5, courseId: 2, recipeId: 3, recipeName: 'Curry' },
  ],
  'GET /api/variety-rules': [{ tag: 'fish', maxPerWeek: 2, notConsecutiveDays: false }],
  'GET /api/meal-slots': [{ id: 5, weekday: 5, name: 'Dinner', time: '19:00', courses: [{ id: 1, name: 'Starter', main: false }, { id: 2, name: 'Main', main: true }] }],
  'GET /api/recipes': [{ id: 3, name: 'Curry', tags: [] }],
  'GET /api/tags': [
    { id: 1, name: 'fish', key: 'fish', colour: 'teal', recipes: 2, slotRules: 0, varietyRule: true },
    { id: 3, name: 'Pizza', key: 'pizza', colour: 'plum', recipes: 1, slotRules: 1, varietyRule: false },
  ],
}

async function show(extra: Record<string, unknown> = {}) {
  const api = mockApi({ ...base, ...extra })
  renderWithProviders(<PlanningRulesScreen />, '/settings/planning')
  await screen.findByRole('list', { name: 'Slot Rules' })
  return api
}
const slotForm = () => screen.getByRole('button', { name: 'Add Slot Rule' }).closest('form')!
const varietyForm = () => screen.getByRole('button', { name: 'Save Variety Rule' }).closest('form')!
/** The page's own alerts: the ToastProvider always mounts an empty alert live region (.toast-live). */
const pageAlerts = () => screen.queryAllByRole('alert').filter((el) => !el.classList.contains('toast-live'))
async function pickIn(form: HTMLElement, field: string, option: string | RegExp) {
  await userEvent.click(within(form).getByRole('combobox', { name: field }))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

describe('the rule kinds read "Recipe" and "Tag" (SET-14d)', () => {
  it('the "Rule is for" options are Recipe and Tag, Recipe first and checked', async () => {
    await show()
    const radios = within(screen.getByRole('radiogroup', { name: 'Rule is for' })).getAllByRole('radio')
    expect(radios.map((r) => r.getAttribute('aria-label') ?? r.textContent)).toEqual(['Recipe', 'Tag'])
    expect(screen.getByRole('radio', { name: 'Recipe' })).toBeChecked()
  })
})

describe('Slot Rule form: errors at the field (SAFE-04)', () => {
  it('Add Slot Rule with no Recipe: nothing is sent; the Recipe field says what to choose and takes focus; the button stays enabled', async () => {
    const api = await show()
    await userEvent.click(screen.getByRole('button', { name: 'Add Slot Rule' }))
    expect(api.callsTo('POST', '/api/slot-rules')).toHaveLength(0)
    const recipe = within(slotForm()).getByRole('combobox', { name: 'Recipe' })
    expect(recipe).toHaveAttribute('aria-invalid', 'true')
    expect(recipe).toHaveAccessibleDescription(expect.stringContaining('Choose the Recipe this Meal Slot always gets.'))
    expect(recipe).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Add Slot Rule' })).toBeEnabled()
    expect(pageAlerts()).toHaveLength(0)
  })

  it('Add Slot Rule by Tag with no Tag: the Tag field says "Choose the Tag this Meal Slot always gets." and takes focus', async () => {
    await show()
    await userEvent.click(screen.getByRole('radio', { name: 'Tag' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add Slot Rule' }))
    const tag = within(slotForm()).getByRole('combobox', { name: 'Tag' })
    expect(tag).toHaveAttribute('aria-invalid', 'true')
    expect(tag).toHaveAccessibleDescription(expect.stringContaining('Choose the Tag this Meal Slot always gets.'))
    expect(tag).toHaveFocus()
    expect(pageAlerts()).toHaveLength(0)
  })

  it('the error goes as soon as the field is fixed, and the rule can then be added', async () => {
    const api = await show({ 'POST /api/slot-rules': { id: 12, mealSlotId: 5, courseId: 2, recipeId: 3 } })
    await userEvent.click(screen.getByRole('button', { name: 'Add Slot Rule' }))
    await pickIn(slotForm(), 'Recipe', /Curry/)
    expect(within(slotForm()).getByRole('combobox', { name: 'Recipe' })).not.toHaveAttribute('aria-invalid', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Add Slot Rule' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/slot-rules')).toHaveLength(1))
  })

  it('a server refusal that belongs to no field ("That Slot Rule already exists.") is the form\'s one FormError, above the button', async () => {
    await show({ 'POST /api/slot-rules': { status: 409, json: { error: { code: 'duplicate_rule', message: 'dup' } } } })
    await pickIn(slotForm(), 'Recipe', /Curry/)
    await userEvent.click(screen.getByRole('button', { name: 'Add Slot Rule' }))
    await waitFor(() => expect(pageAlerts()).toHaveLength(1))
    const alert = pageAlerts()[0]!
    expect(alert).toHaveTextContent('That Slot Rule already exists.')
    expect(slotForm()).toContainElement(alert)
    expect(alert.compareDocumentPosition(screen.getByRole('button', { name: 'Add Slot Rule' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull()
  })
})

describe('Variety Rule form: errors at the field (SAFE-04)', () => {
  it('Save Variety Rule with no Tag: "Choose a Tag for the rule." under the Tag field, focus on it', async () => {
    const api = await show()
    await userEvent.click(screen.getByRole('button', { name: 'Save Variety Rule' }))
    expect(api.calls.filter((c) => c.method === 'PUT' && c.path.startsWith('/api/variety-rules'))).toHaveLength(0)
    const tag = within(varietyForm()).getByRole('combobox', { name: 'Tag' })
    expect(tag).toHaveAttribute('aria-invalid', 'true')
    expect(tag).toHaveAccessibleDescription(expect.stringContaining('Choose a Tag for the rule.'))
    expect(tag).toHaveFocus()
    expect(pageAlerts()).toHaveLength(0)
  })

  it('with a Tag but no limit: the message is under "At most per week", and focus goes to that field', async () => {
    await show()
    await pickIn(varietyForm(), 'Tag', /fish/)
    await userEvent.clear(within(varietyForm()).getByRole('spinbutton', { name: 'At most per week' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Variety Rule' }))
    const limit = within(varietyForm()).getByRole('spinbutton', { name: 'At most per week' })
    expect(limit).toHaveAttribute('aria-invalid', 'true')
    expect(limit).toHaveAccessibleDescription(expect.stringContaining('Choose a weekly limit or not on consecutive days.'))
    expect(limit).toHaveFocus()
    expect(pageAlerts()).toHaveLength(0)
  })

  it('with both wrong, focus goes to the first invalid field in the form (the Tag), and both are marked', async () => {
    await show()
    await userEvent.clear(within(varietyForm()).getByRole('spinbutton', { name: 'At most per week' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Variety Rule' }))
    const form = within(varietyForm())
    expect(form.getByRole('combobox', { name: 'Tag' })).toHaveFocus()
    expect(form.getByRole('spinbutton', { name: 'At most per week' })).toHaveAttribute('aria-invalid', 'true')
  })

  it('there is no role=alert inside either form while only fields are wrong (the field error is read by focus and aria-describedby)', async () => {
    await show()
    await userEvent.click(screen.getByRole('button', { name: 'Add Slot Rule' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Variety Rule' }))
    expect(slotForm().querySelector('[role="alert"]')).toBeNull()
    expect(varietyForm().querySelector('[role="alert"]')).toBeNull()
  })
})

describe('light removals: at once, then Undo (SAFE-02)', () => {
  const removeSlotRule = (name: string) => userEvent.click(within(screen.getByRole('list', { name: 'Slot Rules' })).getByRole('button', { name }))

  it('the Remove buttons say which rule they remove', async () => {
    await show()
    const slot = within(screen.getByRole('list', { name: 'Slot Rules' }))
    expect(slot.getByRole('button', { name: 'Remove Slot Rule Friday Dinner · Main = Curry' })).toHaveTextContent('Remove')
    expect(slot.getByRole('button', { name: 'Remove Slot Rule Friday Dinner = Pizza' })).toHaveTextContent('Remove')
    expect(within(screen.getByRole('list', { name: 'Variety Rules' })).getByRole('button', { name: 'Remove Variety Rule for fish' })).toHaveTextContent('Remove')
  })

  it('removing a Slot Rule asks nothing: it is deleted at once and a toast with Undo says so', async () => {
    const api = await show({ 'DELETE /api/slot-rules/9': undefined })
    await removeSlotRule('Remove Slot Rule Friday Dinner = Pizza')
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(api.callsTo('DELETE', '/api/slot-rules/9')).toHaveLength(1))
    const toast = await findToast('Slot Rule Friday Dinner = Pizza removed')
    expect(within(toast).getByRole('button', { name: 'Undo: Slot Rule Friday Dinner = Pizza removed' })).toBeInTheDocument()
  })

  it('Undo puts a Tag Slot Rule back by adding it again, then says it is back', async () => {
    const api = await show({ 'DELETE /api/slot-rules/9': undefined, 'POST /api/slot-rules': { id: 20, mealSlotId: 5, tag: 'pizza' } })
    await removeSlotRule('Remove Slot Rule Friday Dinner = Pizza')
    await userEvent.click(within(await findToast('Slot Rule Friday Dinner = Pizza removed')).getByRole('button', { name: /^Undo/ }))
    await waitFor(() => expect(api.callsTo('POST', '/api/slot-rules')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/slot-rules')[0]?.body).toEqual({ mealSlotId: 5, tag: 'pizza' })
    await findToast('Slot Rule Friday Dinner = Pizza is back')
  })

  it('Undo of a Recipe rule on a Course sends the Recipe and the Course', async () => {
    const api = await show({ 'DELETE /api/slot-rules/11': undefined, 'POST /api/slot-rules': { id: 21, mealSlotId: 5, courseId: 2, recipeId: 3 } })
    await removeSlotRule('Remove Slot Rule Friday Dinner · Main = Curry')
    await userEvent.click(within(await findToast('Slot Rule Friday Dinner · Main = Curry removed')).getByRole('button', { name: /^Undo/ }))
    await waitFor(() => expect(api.callsTo('POST', '/api/slot-rules')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/slot-rules')[0]?.body).toEqual({ mealSlotId: 5, courseId: 2, recipeId: 3 })
  })

  it('removing a Variety Rule: "Variety Rule for fish removed", and Undo saves it again with its limits', async () => {
    const api = await show({ 'DELETE /api/variety-rules/fish': undefined, 'PUT /api/variety-rules/fish': { tag: 'fish', maxPerWeek: 2, notConsecutiveDays: false } })
    await userEvent.click(within(screen.getByRole('list', { name: 'Variety Rules' })).getByRole('button', { name: 'Remove Variety Rule for fish' }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/variety-rules/fish')).toHaveLength(1))
    await userEvent.click(within(await findToast('Variety Rule for fish removed')).getByRole('button', { name: 'Undo: Variety Rule for fish removed' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/variety-rules/fish')).toHaveLength(1))
    expect(api.callsTo('PUT', '/api/variety-rules/fish')[0]?.body).toEqual({ maxPerWeek: 2, notConsecutiveDays: false })
    await findToast('Variety Rule for fish is back')
  })

  it('a refused Undo says "Nothing was undone" (warning), never a second removal or a silent failure', async () => {
    await show({ 'DELETE /api/slot-rules/9': undefined, 'POST /api/slot-rules': { status: 409, json: { error: { code: 'duplicate_rule', message: 'dup' } } } })
    await removeSlotRule('Remove Slot Rule Friday Dinner = Pizza')
    await userEvent.click(within(await findToast('Slot Rule Friday Dinner = Pizza removed')).getByRole('button', { name: /^Undo/ }))
    await findToast('Nothing was undone')
  })
})
