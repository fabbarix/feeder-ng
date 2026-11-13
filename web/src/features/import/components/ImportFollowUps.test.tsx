// BR-E (design §13): after Confirm, "Read Béchamel now" and the bulk link sheet for each Base recipe the import created or converted.
// RED until components/ImportFollowUps.tsx exists. The sheet is BR-D's LinkCandidatesSheet, reused.
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { candidateJSON, mockApi, renderWithProviders, summaryJSON } from '../../../lib/baseRecipes/test-utils'
import { applied, confirmed } from '../fixtures.baseRecipes.test-helper'
import { ImportFollowUps } from './ImportFollowUps'

const line = '$.recipes[0].ingredients[1]'
const lines = [candidateJSON({ lineId: 2, recipeId: 11, recipeName: 'Lasagne' }), candidateJSON({ lineId: 3, recipeId: 12, recipeName: 'Moussaka' })]
const routes = () => ({
  'GET /api/recipes/3': summaryJSON({ id: 3, name: 'Béchamel', baseIngredientId: 30 }),
  'GET /api/recipes/3/link-candidates': { baseUnit: 'ml', lines },
})
const show = (result: ReturnType<typeof confirmed>) => {
  const onReadNext = vi.fn()
  renderWithProviders(<ImportFollowUps result={result} onReadNext={onReadNext} />)
  return { onReadNext }
}

describe('ImportFollowUps: Read it next', () => {
  it('offers "Read Béchamel now" for a created Base recipe asked to be read next', () => {
    mockApi(routes())
    show(confirmed([applied({ id: 3, name: 'Béchamel', baseRecipe: true, line, readNext: true })]))
    expect(screen.getByRole('button', { name: 'Read Béchamel now' })).toBeInTheDocument()
  })

  it('opens the read for that Base recipe, with the line that asked for it', async () => {
    mockApi(routes())
    const { onReadNext } = show(confirmed([applied({ id: 3, name: 'Béchamel', baseRecipe: true, line, readNext: true })]))
    await userEvent.click(screen.getByRole('button', { name: 'Read Béchamel now' }))
    expect(onReadNext).toHaveBeenCalledWith({ recipeId: 3, name: 'Béchamel', line })
  })

  it('offers nothing for a Base recipe that is filled in later', () => {
    mockApi(routes())
    show(confirmed([applied({ id: 3, name: 'Béchamel', baseRecipe: true, line })]))
    expect(screen.queryByRole('button', { name: /^Read / })).toBeNull()
  })
})

describe('ImportFollowUps: the bulk link sheet', () => {
  it('opens for a created Base recipe: "2 Recipes use an Ingredient named béchamel", nothing ticked, nothing linked', async () => {
    const api = mockApi(routes())
    show(confirmed([applied({ id: 3, name: 'Béchamel', baseRecipe: true, line })]))
    expect(await screen.findByText('2 Recipes use an Ingredient named béchamel. Link them to this Base recipe?')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox').every((b) => !(b as HTMLInputElement).checked)).toBe(true)
    expect(api.calls.filter((c) => c.method !== 'GET')).toEqual([])
  })

  it('opens for a converted Recipe too', async () => {
    mockApi({
      'GET /api/recipes/4': summaryJSON({ id: 4, name: 'Pesto', baseIngredientId: 40 }),
      'GET /api/recipes/4/link-candidates': { baseUnit: 'g', lines: [candidateJSON({ lineId: 9, recipeId: 20, recipeName: 'Pasta', ingredientName: 'pesto' })] },
    })
    show(confirmed([applied({ id: 4, name: 'Pesto', action: 'converted', baseRecipe: true })]))
    expect(await screen.findByText('1 Recipe uses an Ingredient named pesto. Link it to this Base recipe?')).toBeInTheDocument()
  })

  it('does not open for plannable Recipes only', () => {
    const api = mockApi({})
    show(confirmed([applied()]))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.calls).toEqual([])
  })

  it('Not now links nothing and closes the sheet', async () => {
    const api = mockApi(routes())
    show(confirmed([applied({ id: 3, name: 'Béchamel', baseRecipe: true, line })]))
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.calls.filter((c) => c.method === 'POST')).toEqual([])
  })

  it('Link 1 links exactly the ticked line', async () => {
    const api = mockApi({ ...routes(), 'POST /api/recipes/3/link': { linked: [3], mergeOffer: [] } })
    show(confirmed([applied({ id: 3, name: 'Béchamel', baseRecipe: true, line })]))
    await userEvent.click(await screen.findByRole('checkbox', { name: /Moussaka/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Link 1' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/recipes/3/link')[0]?.body).toEqual({ lineIds: [3] }))
  })

  it('goes on to the next Base recipe after the first sheet is done', async () => {
    mockApi({
      ...routes(),
      'GET /api/recipes/4': summaryJSON({ id: 4, name: 'Roux', baseIngredientId: 40 }),
      'GET /api/recipes/4/link-candidates': { baseUnit: 'g', lines: [candidateJSON({ lineId: 9, recipeId: 20, recipeName: 'Gratin', ingredientName: 'roux' })] },
    })
    show(confirmed([applied({ id: 3, name: 'Béchamel', baseRecipe: true }), applied({ id: 4, name: 'Roux', baseRecipe: true })]))
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }))
    expect(await screen.findByText('1 Recipe uses an Ingredient named roux. Link it to this Base recipe?')).toBeInTheDocument()
  })

  it('skips a Base recipe with no candidate (the shared sheet closes by itself) and shows nothing', async () => {
    mockApi({
      'GET /api/recipes/3': summaryJSON({ id: 3, name: 'Béchamel', baseIngredientId: 30 }),
      'GET /api/recipes/3/link-candidates': { baseUnit: 'ml', lines: [] },
    })
    show(confirmed([applied({ id: 3, name: 'Béchamel', baseRecipe: true })]))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
