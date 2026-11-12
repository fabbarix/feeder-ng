// TG-PW: the Planning rules screen with Tag colours from GET /api/tags and Courses from GET /api/meal-slots.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockApi, renderWithProviders } from '../test-utils'
import { rulesStrings } from '../lib/rulesStrings'
import { PlanningRulesScreen } from './PlanningRulesScreen'

const base = {
  'GET /api/slot-rules': [{ id: 9, mealSlotId: 5, courseId: 1, tag: 'fish' }],
  'GET /api/variety-rules': [{ tag: 'fish', maxPerWeek: 2, notConsecutiveDays: false }, { tag: 'soup', maxPerWeek: 1, notConsecutiveDays: false }],
  'GET /api/meal-slots': [
    { id: 5, weekday: 5, name: 'Dinner', time: '19:00', courses: [{ id: 1, name: 'Starter', main: false }, { id: 2, name: 'Main', main: true }] },
  ],
  'GET /api/recipes': [{ id: 3, name: 'Curry', tags: [] }],
  'GET /api/tags': [{ id: 1, name: 'Fish', key: 'fish', colour: 'teal', recipes: 2, slotRules: 1, varietyRule: true }],
}

describe('PlanningRulesScreen with Tag colours and Courses', () => {
  it('rule rows carry the Tag name and colour from /api/tags; a Tag that is gone is a neutral pill with its key', async () => {
    mockApi(base)
    renderWithProviders(<PlanningRulesScreen />)
    const slotList = within(await screen.findByRole('list', { name: 'Slot Rules' }))
    expect((await slotList.findByText('Fish')).closest('.chip')).toHaveAttribute('data-tag-colour', 'teal')
    const varietyList = within(screen.getByRole('list', { name: 'Variety Rules' }))
    expect((await varietyList.findByText('Fish')).closest('.chip')).toHaveAttribute('data-tag-colour', 'teal')
    expect(varietyList.getByText('soup').closest('.chip')).not.toHaveAttribute('data-tag-colour')
  })

  it('the Slot Rule row names its Course', async () => {
    mockApi(base)
    renderWithProviders(<PlanningRulesScreen />)
    expect(await screen.findByText('Friday Dinner · Starter')).toBeInTheDocument()
  })

  it('adding a Slot Rule posts the picked Course', async () => {
    const api = mockApi({ ...base, 'POST /api/slot-rules': { id: 10, mealSlotId: 5, courseId: 2, recipeId: 3 } })
    renderWithProviders(<PlanningRulesScreen />)
    await screen.findByText('Friday Dinner · Starter')
    await userEvent.click(await screen.findByRole('combobox', { name: 'Recipe' }))
    await userEvent.click(await screen.findByRole('option', { name: /Curry/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Add Slot Rule' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/slot-rules')[0]?.body).toEqual({ mealSlotId: 5, courseId: 2, recipeId: 3 }))
  })

  it('adding a Slot Rule by Tag posts the Tag key', async () => {
    const api = mockApi({ ...base, 'POST /api/slot-rules': { id: 10, mealSlotId: 5, courseId: 2, tag: 'fish' } })
    renderWithProviders(<PlanningRulesScreen />)
    await screen.findByText('Friday Dinner · Starter')
    await userEvent.click(screen.getByRole('radio', { name: 'a Tag' }))
    await userEvent.click(screen.getAllByRole('combobox', { name: 'Tag' })[0]!)
    await userEvent.click(await screen.findByRole('option', { name: /Fish/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Add Slot Rule' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/slot-rules')[0]?.body).toEqual({ mealSlotId: 5, courseId: 2, tag: 'fish' }))
  })

  it('an unknown Tag from the server shows a crafted message, not the raw one', async () => {
    mockApi({ ...base, 'POST /api/slot-rules': { status: 422, json: { error: { code: 'tag_unknown', message: 'No such Tag' } } } })
    renderWithProviders(<PlanningRulesScreen />)
    await screen.findByText('Friday Dinner · Starter')
    await userEvent.click(screen.getByRole('radio', { name: 'a Tag' }))
    await userEvent.click(screen.getAllByRole('combobox', { name: 'Tag' })[0]!)
    await userEvent.click(await screen.findByRole('option', { name: /Fish/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Add Slot Rule' }))
    expect(await screen.findByText(rulesStrings.unknownTag as string)).toBeInTheDocument()
    expect(screen.queryByText('No such Tag')).not.toBeInTheDocument()
  })
})
