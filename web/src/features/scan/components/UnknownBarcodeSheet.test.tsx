import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { UnknownMode } from '../lib/unknownForm'
import { UnknownBarcodeSheet } from './UnknownBarcodeSheet'

const ingredients = [
  { id: 1, name: 'passata', baseUnit: 'g' as const },
  { id: 2, name: 'milk', baseUnit: 'ml' as const },
]

function setup(mode: UnknownMode = 'pack') {
  const onSave = vi.fn()
  render(<UnknownBarcodeSheet open onClose={() => {}} mode={mode} shopName="Coop" ingredients={ingredients} onSave={onSave} priceText={mode === 'weighed_price' ? '$2.50' : undefined} />)
  return onSave
}

async function pickIngredient(name: string) {
  await userEvent.type(screen.getByRole('combobox', { name: 'Ingredient' }), name)
  await userEvent.click(screen.getByRole('option', { name: name }))
}

describe('UnknownBarcodeSheet', () => {
  it('asks for the Ingredient, the pack size and unit, the name and the scope', () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: 'What is this?' })
    for (const label of ['Ingredient', 'Pack size', 'Unit', 'Product name']) expect(within(dialog).getByLabelText(label)).toBeInTheDocument()
    expect(within(dialog).getByRole('radio', { name: 'Any Shop' })).toBeChecked()
    expect(within(dialog).getByRole('radio', { name: 'This Shop only' })).not.toBeChecked()
    expect(within(dialog).getByText(/Coop/)).toBeInTheDocument()
  })

  it('prefills the Product name from the Ingredient and the pack size', async () => {
    setup()
    await pickIngredient('passata')
    await userEvent.type(screen.getByLabelText('Pack size'), '700')
    expect(screen.getByLabelText('Product name')).toHaveValue('Passata 700 g')
  })

  it('keeps a Product name the User typed', async () => {
    setup()
    await pickIngredient('passata')
    const name = screen.getByLabelText('Product name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Mutti polpa')
    await userEvent.type(screen.getByLabelText('Pack size'), '700')
    expect(name).toHaveValue('Mutti polpa')
  })

  it('offers to create an Ingredient that does not exist', async () => {
    setup()
    await userEvent.type(screen.getByRole('combobox', { name: 'Ingredient' }), 'tinned tomatoes')
    expect(screen.getByRole('option', { name: 'Create "tinned tomatoes"' })).toBeInTheDocument()
  })

  it('saves a complete form', async () => {
    const onSave = setup()
    await pickIngredient('milk')
    await userEvent.type(screen.getByLabelText('Pack size'), '1')
    await userEvent.selectOptions(screen.getByLabelText('Unit'), 'l')
    await userEvent.click(screen.getByRole('radio', { name: 'This Shop only' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ ingredient: { id: 2, name: 'milk', baseUnit: 'ml' }, packSize: '1', packUnit: 'l', scope: 'shop', productName: 'Milk 1000 ml' })
  })

  it('does not save an incomplete form and says what is missing', async () => {
    const onSave = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getAllByText('Required').length).toBeGreaterThanOrEqual(2)
  })

  it('a weighed code asks only for the Ingredient and the Product name', async () => {
    const onSave = setup('weighed')
    expect(screen.getByRole('dialog', { name: 'What is this weighed item?' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Pack size')).toBeNull()
    expect(screen.queryByLabelText('Unit')).toBeNull()
    expect(screen.queryByRole('radio', { name: 'This Shop only' })).toBeNull()
    await pickIngredient('passata')
    await userEvent.type(screen.getByLabelText('Product name'), 'Loose passata')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('a price-valued weighed code also asks for the weight, once', async () => {
    const onSave = setup('weighed_price')
    expect(screen.getByText(/\$2\.50/)).toBeInTheDocument()
    await pickIngredient('passata')
    await userEvent.type(screen.getByLabelText('Product name'), 'Loose passata')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('Weight (g)'), '500')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ weightText: '500' })
  })
})
