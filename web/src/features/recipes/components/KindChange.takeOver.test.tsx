import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { mockApi, refusal, renderWithProviders, summaryJSON } from '../../../lib/baseRecipes/test-utils'
import { KindChange } from './KindChange'

// BR-D round 4: turning a Recipe into a Base recipe on Save: confirm, then the take-over ask when its name is an Ingredient's (409 on to-base).
const plan = { plannedMeals: [], slotRules: [], leftovers: 0, preferences: 0 }
const ask = (over = {}) => refusal(409, 'base_recipe_take_over', { ingredient: { id: 5, name: 'pesto' }, recipes: [{ id: 1, name: 'Lasagne' }, { id: 2, name: 'Moussaka' }], stockLots: 1, convertible: true, ...over })
const start = async (toBase: (n: number) => unknown) => {
  let n = 0
  const api = mockApi({ 'POST /api/recipes/4/to-base?dryRun=1': plan, 'POST /api/recipes/4/to-base': () => toBase(++n) })
  const onResult = vi.fn()
  renderWithProviders(<KindChange recipeId={4} on name="Pesto" yieldValue={4} yieldUnit="portion" onResult={onResult} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Turn into a Base recipe' }))
  return { api, onResult }
}
const asked = (n: number) => (n === 1 ? ask() : summaryJSON({ id: 4, name: 'Pesto' }))

describe('KindChange: the take-over ask', () => {
  it('shows the TakeOverDialog naming the Recipes and Stock; the Recipe is not saved yet', async () => {
    const { onResult } = await start(asked)
    const dialog = await screen.findByRole('dialog', { name: 'Pesto (Base recipe) has the name of an Ingredient. Take it over?' })
    expect(dialog).toHaveTextContent('Lasagne and Moussaka call for it, and 1 Stock Lot of it is in the Pantry.')
    expect(onResult).not.toHaveBeenCalled()
  })

  it('Yes converts with takeOver true and reports done', async () => {
    const { api, onResult } = await start(asked)
    await userEvent.click(await screen.findByRole('button', { name: 'Yes, take it over' }))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith('done', null))
    expect(api.callsTo('POST', '/api/recipes/4/to-base')[1]?.body).toEqual({ yield: 4, yieldUnit: 'portion', takeOver: true })
  })

  it('No converts with takeOver false and reports done', async () => {
    const { api, onResult } = await start(asked)
    await userEvent.click(await screen.findByRole('button', { name: 'No, keep it apart' }))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith('done', null))
    expect(api.callsTo('POST', '/api/recipes/4/to-base')[1]?.body).toEqual({ yield: 4, yieldUnit: 'portion', takeOver: false })
  })

  it('Escape reports cancelled and converts nothing', async () => {
    const { api, onResult } = await start(asked)
    await screen.findByRole('dialog', { name: /Take it over\?/ })
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(onResult).toHaveBeenCalledWith('cancelled', null))
    expect(api.callsTo('POST', '/api/recipes/4/to-base')).toHaveLength(1)
  })

  it('offers only No when the Yield\'s unit cannot convert', async () => {
    const { onResult } = await start(() => ask({ convertible: false }))
    expect(await screen.findByRole('button', { name: 'Yes, take it over' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'No, keep it apart' }))
    await waitFor(() => expect(onResult).toHaveBeenCalled())
  })

  it('reports failed with the words of a refusal after the answer', async () => {
    const { onResult } = await start((n) => (n === 1 ? ask() : refusal(422, 'validation_failed', { field: 'lines[0]', reason: 'base_recipe_cycle', path: ['Pesto', 'Sauce', 'Pesto'] })))
    await userEvent.click(await screen.findByRole('button', { name: 'Yes, take it over' }))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith('failed', 'Pesto calls for Sauce, which calls for Pesto'))
  })
})
