import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockApi, renderWithProviders } from '../test-utils'
import { PlanningRulesScreen } from './PlanningRulesScreen'
import { findNotice } from '../../../test/notices'

const base = {
  'GET /api/slot-rules': [{ id: 9, mealSlotId: 5, tag: 'pizza' }],
  'GET /api/variety-rules': [{ tag: 'fish', maxPerWeek: 2, notConsecutiveDays: false }],
  'GET /api/meal-slots': [{ id: 5, weekday: 5, name: 'Dinner', time: '19:00' }],
  'GET /api/recipes': [{ id: 3, name: 'Curry', tags: [] }],
  'GET /api/tags': [{ name: 'fish', recipes: 2 }, { name: 'pasta', recipes: 4 }],
}

async function pick(field: string, option: string | RegExp) {
  await userEvent.click(screen.getByRole('combobox', { name: field }))
  await userEvent.click(await screen.findByRole('option', { name: option }))
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

  it('has no native <select>', async () => {
    mockApi(base)
    const { container } = renderWithProviders(<PlanningRulesScreen />)
    await screen.findByText('Tag: pizza')
    expect(container.querySelector('select')).toBeNull()
  })

  it('reads the existing Tags once for the Tag selects (read-only use of the recipes API)', async () => {
    const api = mockApi(base)
    renderWithProviders(<PlanningRulesScreen />)
    await screen.findByText('Tag: pizza')
    await waitFor(() => expect(api.callsTo('GET', '/api/tags').length).toBeGreaterThanOrEqual(1))
    expect(api.calls.filter((c) => c.method !== 'GET')).toHaveLength(0)
  })

  it('adding a Slot Rule posts it', async () => {
    const api = mockApi({ ...base, 'POST /api/slot-rules': { id: 10, mealSlotId: 5, recipeId: 3 } })
    renderWithProviders(<PlanningRulesScreen />)
    await screen.findByText('Tag: pizza')
    await pick('Meal Slot', /Dinner/)
    await pick('Recipe', /Curry/)
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

  it('saving a Variety Rule puts it under the picked Tag', async () => {
    const api = mockApi({ ...base, 'PUT /api/variety-rules/pasta': { tag: 'pasta', maxPerWeek: 0, notConsecutiveDays: true } })
    renderWithProviders(<PlanningRulesScreen />)
    await screen.findByText('At most 2 a week')
    const varietyTag = screen.getAllByRole('combobox', { name: 'Tag' }).at(-1)!
    await userEvent.click(varietyTag)
    await userEvent.click(await screen.findByRole('option', { name: /pasta/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Not on consecutive days' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Variety Rule' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/variety-rules/pasta')[0]?.body).toEqual({ maxPerWeek: 1, notConsecutiveDays: true }))
  })

  it('shows the server message when a Slot Rule already exists', async () => {
    mockApi({ ...base, 'POST /api/slot-rules': { status: 409, json: { error: { code: 'duplicate_rule', message: 'dup' } } } })
    renderWithProviders(<PlanningRulesScreen />)
    await screen.findByText('Tag: pizza')
    await pick('Meal Slot', /Dinner/)
    await pick('Recipe', /Curry/)
    await userEvent.click(screen.getByRole('button', { name: 'Add Slot Rule' }))
    expect(await findNotice('alert', 'That Slot Rule already exists.')).toHaveTextContent('That Slot Rule already exists.')
  })

  // R11a N8: the same shared back control as the Settings sub-pages; no stray link to Plan at the bottom.
  it('leads the header with the shared BackLink to Settings and has no link to Plan', async () => {
    mockApi(base)
    const { container } = renderWithProviders(<PlanningRulesScreen />)
    await screen.findByText('Tag: pizza')
    const back = screen.getByRole('link', { name: 'Back to Settings' })
    expect(back).toHaveAttribute('href', '/settings')
    expect(back).toHaveClass('back-link')
    expect(container.querySelector('.page-header__leading')).toContainElement(back)
    expect(screen.queryByRole('link', { name: 'Plan' })).toBeNull()
  })
})
