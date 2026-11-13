import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { candidateJSON, mockApi, renderWithProviders } from '../../../lib/baseRecipes/test-utils'
import { LinkCandidatesSheet } from './LinkCandidatesSheet'

const base = { id: 3, name: 'Béchamel', ingredientId: 30 }
const lines = [
  candidateJSON({ lineId: 1, recipeId: 10, recipeName: 'Cannelloni', quantity: 2, unit: 'cup', linkable: false, reason: 'unit_unconvertible' }),
  candidateJSON({ lineId: 2, recipeId: 11, recipeName: 'Lasagne' }),
  candidateJSON({ lineId: 3, recipeId: 12, recipeName: 'Moussaka', archived: true, quantity: 300 }),
]
const show = (routes: Record<string, unknown> = {}) => {
  const api = mockApi({ 'GET /api/recipes/3/link-candidates': { baseUnit: 'ml', lines }, ...routes })
  const onClose = vi.fn()
  renderWithProviders(<LinkCandidatesSheet open baseRecipe={base} onClose={onClose} />)
  return { api, onClose }
}

describe('LinkCandidatesSheet (design §3.8): never silent, nothing ticked', () => {
  it('asks "N Recipes use an Ingredient named X" and lists each line with a crafted checkbox, none ticked', async () => {
    const { api } = show()
    expect(await screen.findByText('3 Recipes use an Ingredient named béchamel. Link them to this Base recipe?')).toBeInTheDocument()
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(3)
    expect(boxes.every((b) => !(b as HTMLInputElement).checked)).toBe(true)
    expect(screen.getByRole('checkbox', { name: /Lasagne · 500 ml béchamel/ })).toBeInTheDocument()
    expect(api.calls.filter((c) => c.method !== 'GET')).toEqual([]) // opening links nothing
  })

  it('lists a line in cups but cannot be ticked, and says why', async () => {
    show()
    const cup = await screen.findByRole('checkbox', { name: /Cannelloni/ })
    expect(cup).toBeDisabled()
    expect(screen.getByText('cup cannot be converted to ml yet: link it from Cannelloni')).toBeInTheDocument()
  })

  it('counts the ticks on the button; Link is off with nothing ticked', async () => {
    show()
    const link = await screen.findByRole('button', { name: 'Link' })
    expect(link).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: /Lasagne/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Moussaka/ }))
    expect(screen.getByRole('button', { name: 'Link 2' })).toBeEnabled()
  })

  it('Not now links nothing and closes', async () => {
    const { api, onClose } = show()
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(api.calls.filter((c) => c.method === 'POST')).toEqual([])
  })

  it('Link 2 links exactly those 2 lines, then (no merge offered) closes', async () => {
    const { api, onClose } = show({ 'POST /api/recipes/3/link': { linked: [2, 3], mergeOffer: [] } })
    await userEvent.click(await screen.findByRole('checkbox', { name: /Lasagne/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Moussaka/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Link 2' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/recipes/3/link')[0]?.body).toEqual({ lineIds: [2, 3] }))
    expect(await screen.findByText('Linked 2 Recipes')).toBeInTheDocument()
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it('ends with the merge offer: Merge moves the old Ingredient into the Base recipe\'s', async () => {
    const { api, onClose } = show({
      'POST /api/recipes/3/link': { linked: [2], mergeOffer: [{ ingredientId: 5, name: 'béchamel', stockLots: 2, products: 0 }] },
      'GET /api/ingredients/5/merge-preview?into=30': { blocked: '', conflicts: [] },
      'POST /api/ingredients/5/merge': { id: 30 },
    })
    await userEvent.click(await screen.findByRole('checkbox', { name: /Lasagne/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Link 1' }))
    expect(await screen.findByText('béchamel is no longer on any Recipe. Merge it into Béchamel (Base recipe)?')).toBeInTheDocument()
    expect(screen.getByText('Its 2 Stock Lots move too.')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/ingredients/5/merge')[0]?.body).toEqual({ into: 30 }))
  })

  it('Keep it leaves the old Ingredient alone', async () => {
    const { api, onClose } = show({ 'POST /api/recipes/3/link': { linked: [2], mergeOffer: [{ ingredientId: 5, name: 'béchamel', stockLots: 0, products: 0 }] } })
    await userEvent.click(await screen.findByRole('checkbox', { name: /Lasagne/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Link 1' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Keep it' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(api.calls.some((c) => c.path.includes('/merge'))).toBe(false)
  })

  it('shows nothing and closes when there is nothing to link', async () => {
    mockApi({ 'GET /api/recipes/3/link-candidates': { baseUnit: 'ml', lines: [] } })
    const onClose = vi.fn()
    renderWithProviders(<LinkCandidatesSheet open baseRecipe={base} onClose={onClose} />)
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
