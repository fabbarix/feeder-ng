import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders, summaryJSON } from '../../../lib/baseRecipes/test-utils'
import { BaseRecipePicker } from './BaseRecipePicker'

const routes = () => ({
  'GET /api/recipes?kind=base': [summaryJSON({ id: 1, name: 'Roux', yield: 300, yieldUnit: 'g' }), summaryJSON({ id: 2, name: 'Béchamel' }), summaryJSON({ id: 3, name: 'Béchamel light' })],
  'GET /api/recipes': [{ ...summaryJSON({ id: 20, name: 'Pesto', baseRecipe: false, yieldUnit: null, yield: 4 }) }],
})
const open = async (over = {}) => {
  const props = { open: true, lineName: 'béchamel', onClose: vi.fn(), onChoose: vi.fn(), ...over }
  mockApi(routes())
  renderWithProviders(<BaseRecipePicker {...props} />)
  await screen.findByRole('option', { name: /^Béchamel,/ })
  return props
}

describe('BaseRecipePicker (design §3.7)', () => {
  it('is a dialog titled "Link to a Base recipe" with a search field and a listbox (no native select or datalist)', async () => {
    await open()
    expect(screen.getByRole('dialog', { name: 'Link to a Base recipe' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search Base recipes' })).toBeInTheDocument()
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(document.querySelector('select, datalist')).toBeNull()
  })

  it('lists the Base recipes with the exact match first and the Yield on each', async () => {
    await open()
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAccessibleName(/^Béchamel, Yield 1 l/)
    expect(options[1]).toHaveAccessibleName(/^Béchamel light/)
    expect(options.map((o) => o.textContent).some((t) => t?.includes('Roux'))).toBe(true)
  })

  it('then offers to add the name as a new Base recipe (not when a Base recipe has exactly that name)', async () => {
    await open({ lineName: 'ragù' })
    expect(await screen.findByRole('option', { name: 'Add "Ragù" as a new Base recipe' })).toBeInTheDocument()
  })

  it('searches', async () => {
    await open()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search Base recipes' }), 'roux')
    await waitFor(() => expect(screen.queryByRole('option', { name: /^Béchamel,/ })).toBeNull())
    expect(screen.getByRole('option', { name: /^Roux/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Add "Roux" as a new Base recipe' })).toBeInTheDocument()
  })

  it('chooses an existing Base recipe', async () => {
    const p = await open()
    await userEvent.click(screen.getByRole('option', { name: /^Béchamel,/ }))
    expect(p.onChoose).toHaveBeenCalledWith({ kind: 'existing', baseRecipe: { id: 2, name: 'Béchamel' } })
  })

  it('chooses to add a new Base recipe, named from the line', async () => {
    const p = await open({ lineName: 'ragù' })
    await userEvent.click(await screen.findByRole('option', { name: 'Add "Ragù" as a new Base recipe' }))
    expect(p.onChoose).toHaveBeenCalledWith({ kind: 'new', name: 'Ragù' })
  })

  it('has a group "Recipes you plan"; choosing one is a convert choice (the confirm follows in the hook)', async () => {
    const p = await open({ lineName: 'pesto' })
    const group = await screen.findByRole('group', { name: 'Recipes you plan' })
    await userEvent.click(within(group).getByRole('option', { name: /^Pesto/ }))
    expect(p.onChoose).toHaveBeenCalledWith({ kind: 'convert', recipe: { id: 20, name: 'Pesto' } })
  })
})

describe('BaseRecipePicker: cycles', () => {
  it('lists a Base recipe that calls for the Recipe being edited disabled, with the reason, and chooses nothing', async () => {
    mockApi({
      ...routes(),
      'GET /api/recipes/1': { ...summaryJSON({ id: 1, name: 'Roux' }), usedBy: [{ id: 2, name: 'Béchamel' }] },
      'GET /api/recipes/2': { ...summaryJSON({ id: 2, name: 'Béchamel' }), usedBy: [] },
    })
    const props = { open: true, lineName: 'béchamel', recipeId: 1, onClose: vi.fn(), onChoose: vi.fn() }
    renderWithProviders(<BaseRecipePicker {...props} />)
    const row = await screen.findByRole('option', { name: /^Béchamel,/ })
    await waitFor(() => expect(row).toHaveAttribute('aria-disabled', 'true'))
    expect(row).toHaveTextContent('Béchamel already calls for this Recipe')
    await userEvent.click(row)
    expect(props.onChoose).not.toHaveBeenCalled()
    expect(screen.queryByRole('option', { name: /^Roux/ })).toBeNull() // the Recipe itself is left out
  })
})
