// R2-4: the "what is this?" sheet adopts the near-duplicate guard of the New Ingredient sheet (R14). An Ingredient created
// (the server normalises names, so it can call a typed name an exact match even where the picker lists no equal name)
// here is looked up with `findSimilar` (the matcher of Import Review); an exact or near match is offered before it is created.
// No `findSimilar` (offline) or a rejected lookup: the Ingredient is created at once, as before.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Ingredient, SearchResult } from '../../ingredients/types'
import { UnknownBarcodeSheet } from './UnknownBarcodeSheet'

const garlic: Ingredient = { id: 9, name: 'garlic', baseUnit: 'g', shelfLifeDays: null, conversions: [] }
const ingredients = [{ id: 1, name: 'passata', baseUnit: 'g' as const }, { id: 9, name: 'garlic', baseUnit: 'g' as const }]

function setup(findSimilar?: (name: string) => Promise<SearchResult>) {
  const onSave = vi.fn()
  render(<UnknownBarcodeSheet open onClose={() => {}} mode="pack" shopName="Coop" ingredients={ingredients} onSave={onSave} findSimilar={findSimilar} />)
  return onSave
}
async function createIngredient(name: string) {
  await userEvent.click(screen.getByRole('combobox', { name: /Ingredient/ }))
  await userEvent.type(screen.getByRole('searchbox'), name)
  await userEvent.click(screen.getByRole('option', { name: `Create Ingredient "${name}"` }))
}
async function fillAndSave() {
  await userEvent.type(screen.getByRole('spinbutton', { name: 'Pack size' }), '100')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
}

describe('UnknownBarcodeSheet duplicate guard', () => {
  it('looks the typed name up when an Ingredient is created, and says an exact match already exists', async () => {
    const findSimilar = vi.fn().mockResolvedValue({ exact: garlic, suggestions: [] })
    setup(findSimilar)
    await createIngredient('Garlick')
    expect(findSimilar).toHaveBeenCalledWith('Garlick')
    const guard = await screen.findByRole('status')
    expect(guard).toHaveTextContent('garlic already exists')
    expect(within(guard).getByRole('button', { name: 'Use garlic' })).toBeInTheDocument()
    expect(within(guard).queryByRole('button', { name: /anyway/ })).toBeNull()
  })

  it('"Use garlic" swaps the new Ingredient for the existing one (its id, its Base Unit) and clears the guard', async () => {
    const onSave = setup(vi.fn().mockResolvedValue({ exact: garlic, suggestions: [] }))
    await createIngredient('Garlick')
    await userEvent.click(await screen.findByRole('button', { name: 'Use garlic' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('combobox', { name: /Ingredient/ })).toHaveTextContent('garlic')
    await fillAndSave()
    expect(onSave.mock.calls[0]?.[0].ingredient).toMatchObject({ id: 9, name: 'garlic', baseUnit: 'g' })
  })

  it('near matches: "Did you mean ...?" with a Use button each and Create anyway', async () => {
    const findSimilar = vi.fn().mockResolvedValue({ exact: null, suggestions: [{ ingredient: garlic, score: 0.8 }] })
    setup(findSimilar)
    await createIngredient('Garlik')
    const guard = await screen.findByRole('status')
    expect(guard).toHaveTextContent('Did you mean garlic?')
    expect(within(guard).getByRole('button', { name: 'Use garlic' })).toBeInTheDocument()
    expect(within(guard).getByRole('button', { name: "Create 'Garlik' anyway" })).toBeInTheDocument()
  })

  it('"Create anyway" keeps the new Ingredient (no id) and clears the guard', async () => {
    const onSave = setup(vi.fn().mockResolvedValue({ exact: null, suggestions: [{ ingredient: garlic, score: 0.8 }] }))
    await createIngredient('Garlik')
    await userEvent.click(await screen.findByRole('button', { name: "Create 'Garlik' anyway" }))
    expect(screen.queryByRole('status')).toBeNull()
    await fillAndSave()
    expect(onSave.mock.calls[0]?.[0].ingredient).toMatchObject({ name: 'Garlik' })
    expect(onSave.mock.calls[0]?.[0].ingredient).not.toHaveProperty('id')
  })

  it('Save is held while the guard is unanswered', async () => {
    const onSave = setup(vi.fn().mockResolvedValue({ exact: null, suggestions: [{ ingredient: garlic, score: 0.8 }] }))
    await createIngredient('Garlik')
    await screen.findByRole('status')
    await fillAndSave()
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('no match: no guard, the Ingredient is created as before', async () => {
    const onSave = setup(vi.fn().mockResolvedValue({ exact: null, suggestions: [] }))
    await createIngredient('Sumac')
    await fillAndSave()
    expect(screen.queryByRole('status')).toBeNull()
    expect(onSave.mock.calls[0]?.[0].ingredient).toMatchObject({ name: 'Sumac', baseUnit: 'g' })
  })

  it('a failed lookup never blocks', async () => {
    const onSave = setup(vi.fn().mockRejectedValue(new Error('offline')))
    await createIngredient('Sumac')
    await fillAndSave()
    expect(screen.queryByRole('status')).toBeNull()
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('without findSimilar (offline) nothing is looked up', async () => {
    const onSave = setup(undefined)
    await createIngredient('Sumac')
    await fillAndSave()
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('a new Ingredient created in ml units takes Base Unit ml (shared rule)', async () => {
    const onSave = setup(vi.fn().mockResolvedValue({ exact: null, suggestions: [] }))
    await createIngredient('Cream')
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Pack size' }), '250')
    await userEvent.click(screen.getByRole('combobox', { name: /Unit/ }))
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'ml' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave.mock.calls[0]?.[0].ingredient).toMatchObject({ name: 'Cream', baseUnit: 'ml' })
  })
})
