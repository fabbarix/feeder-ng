import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockApi, renderWithProviders } from '../test-utils'
import { PlanningRulesScreen } from './PlanningRulesScreen'

// The app shell keeps two always-mounted live regions (status, alert); pick the one carrying this notice.
const noticeWith = (role: 'status' | 'alert', text: string) =>
  screen.getAllByRole(role).find((el) => el.textContent?.includes(text))
const findNotice = (role: 'status' | 'alert', text: string) =>
  waitFor(() => {
    const el = noticeWith(role, text)
    if (!el) throw new Error(`no ${role} with "${text}"`)
    return el
  })

const base = {
  'GET /api/slot-rules': [{ id: 9, mealSlotId: 5, tag: 'pizza' }],
  'GET /api/variety-rules': [{ tag: 'fish', maxPerWeek: 2, notConsecutiveDays: false }],
  'GET /api/meal-slots': [{ id: 5, weekday: 5, name: 'Dinner' }],
  'GET /api/recipes': [{ id: 3, name: 'Curry' }],
}

describe('PlanningRulesScreen', () => {
  it('shows both editors with the stored rules', async () => {
    mockApi(base)
    renderWithProviders(<PlanningRulesScreen />)
    expect(await screen.findByRole('heading', { name: 'Slot Rules' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Variety Rules' })).toBeInTheDocument()
    expect(await screen.findByText('Tag: pizza')).toBeInTheDocument()
    expect(await screen.findByText('At most 2 a week')).toBeInTheDocument()
  })

  it('adding a Slot Rule posts it', async () => {
    const api = mockApi({ ...base, 'POST /api/slot-rules': { id: 10, mealSlotId: 5, recipeId: 3 } })
    renderWithProviders(<PlanningRulesScreen />)
    await screen.findByText('Tag: pizza')
    await userEvent.selectOptions(screen.getByLabelText('Meal Slot'), 'Friday Dinner')
    await userEvent.selectOptions(await screen.findByLabelText('Recipe'), 'Curry')
    await userEvent.click(screen.getByRole('button', { name: 'Add Slot Rule' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/slot-rules')[0]?.body).toEqual({ mealSlotId: 5, recipeId: 3 }))
  })

  it('removing a Slot Rule deletes it', async () => {
    const api = mockApi({ ...base, 'DELETE /api/slot-rules/9': undefined })
    renderWithProviders(<PlanningRulesScreen />)
    const list = within(await screen.findByRole('list', { name: 'Slot Rules' }))
    await userEvent.click(await list.findByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/slot-rules/9')).toHaveLength(1))
  })

  it('saving a Variety Rule puts it under its normalised Tag', async () => {
    const api = mockApi({ ...base, 'PUT /api/variety-rules/pasta': { tag: 'pasta', maxPerWeek: 0, notConsecutiveDays: true } })
    renderWithProviders(<PlanningRulesScreen />)
    await screen.findByText('At most 2 a week')
    await userEvent.type(screen.getAllByLabelText('Tag').at(-1)!, 'Pasta')
    await userEvent.click(screen.getByLabelText('Not on consecutive days'))
    await userEvent.click(screen.getByRole('button', { name: 'Save Variety Rule' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/variety-rules/pasta')[0]?.body).toEqual({ maxPerWeek: 0, notConsecutiveDays: true }))
  })

  it('shows the server message when a Slot Rule already exists', async () => {
    mockApi({ ...base, 'POST /api/slot-rules': { status: 409, json: { error: { code: 'duplicate_rule', message: 'dup' } } } })
    renderWithProviders(<PlanningRulesScreen />)
    await screen.findByText('Tag: pizza')
    await userEvent.selectOptions(screen.getByLabelText('Meal Slot'), 'Friday Dinner')
    await userEvent.selectOptions(await screen.findByLabelText('Recipe'), 'Curry')
    await userEvent.click(screen.getByRole('button', { name: 'Add Slot Rule' }))
    expect(await findNotice('alert', 'That Slot Rule already exists.')).toHaveTextContent('That Slot Rule already exists.')
  })
})
