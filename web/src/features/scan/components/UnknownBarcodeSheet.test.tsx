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

async function choose(label: string | RegExp, option: string | RegExp) {
  await userEvent.click(screen.getByRole('combobox', { name: label }))
  await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: option }))
}
const pickIngredient = (name: string) => choose(/Ingredient/, new RegExp(`^${name}`))

describe('UnknownBarcodeSheet', () => {
  it('uses no native select, checkbox, radio or bare input', () => {
    setup()
    expect(document.querySelector('select, input[type=radio], input[type=checkbox]')).toBeNull()
  })

  it('asks for the Ingredient (IngredientSelect), the pack size (NumberField) and unit (UnitSelect), the name and the scope', () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: 'What is this?' })
    expect(within(dialog).getByRole('combobox', { name: /Ingredient/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('spinbutton', { name: 'Pack size' })).toBeInTheDocument()
    expect(within(dialog).getByRole('combobox', { name: /Unit/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('textbox', { name: 'Product name' })).toBeInTheDocument()
  })

  it('QA: the scope is a RadioCards group whose legend does not repeat "Any Shop"', () => {
    setup()
    const group = screen.getByRole('radiogroup', { name: 'Where does this barcode apply?' })
    expect(within(group).getByRole('radio', { name: /Any Shop/ })).toHaveAttribute('aria-checked', 'true')
    expect(within(group).getByRole('radio', { name: /This Shop only/ })).toHaveAttribute('aria-checked', 'false')
    expect(within(group).getByText('Only at Coop')).toBeInTheDocument()
    expect(screen.getAllByText('Any Shop')).toHaveLength(1)
  })

  it('prefills the Product name from the Ingredient and the pack size', async () => {
    setup()
    await pickIngredient('passata')
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Pack size' }), '700')
    await userEvent.tab()
    expect(screen.getByRole('textbox', { name: 'Product name' })).toHaveValue('Passata 700 g')
  })

  it('keeps a Product name the User typed', async () => {
    setup()
    await pickIngredient('passata')
    const name = screen.getByRole('textbox', { name: 'Product name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Mutti polpa')
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Pack size' }), '700')
    await userEvent.tab()
    expect(name).toHaveValue('Mutti polpa')
  })

  it('offers to create an Ingredient that does not exist, and takes its Base Unit from the pack unit', async () => {
    const onSave = setup()
    await userEvent.click(screen.getByRole('combobox', { name: /Ingredient/ }))
    await userEvent.type(screen.getByRole('searchbox'), 'tinned tomatoes')
    await userEvent.click(screen.getByRole('option', { name: 'Create Ingredient "tinned tomatoes"' }))
    expect(screen.getByRole('combobox', { name: /Ingredient/ })).toHaveTextContent('tinned tomatoes')
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Pack size' }), '400')
    await choose(/Unit/, 'g')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ ingredient: { name: 'tinned tomatoes', baseUnit: 'g' }, packSize: '400', packUnit: 'g' })
    expect(onSave.mock.calls[0]?.[0].ingredient).not.toHaveProperty('id')
  })

  it('the units offered follow the Ingredient (milk: ml, l)', async () => {
    setup()
    await pickIngredient('milk')
    await userEvent.click(screen.getByRole('combobox', { name: /Unit/ }))
    const names = within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)
    expect(names.join(' ')).toMatch(/\bml\b/)
    expect(names.join(' ')).toMatch(/\bl\b/)
    expect(names.join(' ')).not.toMatch(/\boz\b/)
  })

  it('saves a complete form', async () => {
    const onSave = setup()
    await pickIngredient('milk')
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Pack size' }), '1')
    await choose(/Unit/, /^l\b/)
    await userEvent.click(screen.getByRole('radio', { name: /This Shop only/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ ingredient: { id: 2, name: 'milk', baseUnit: 'ml' }, packSize: '1', packUnit: 'l', scope: 'shop', productName: 'Milk 1000 ml' })
  })

  it('does not save an incomplete form and marks the fields', async () => {
    const onSave = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getAllByText('Required').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('textbox', { name: 'Product name' })).toHaveAttribute('aria-invalid', 'true')
  })

  it('a weighed code asks only for the Ingredient and the Product name', async () => {
    const onSave = setup('weighed')
    expect(screen.getByRole('dialog', { name: 'What is this weighed Product?' })).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: 'Pack size' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: /Unit/ })).toBeNull()
    expect(screen.queryByRole('radiogroup')).toBeNull()
    await pickIngredient('passata')
    await userEvent.type(screen.getByRole('textbox', { name: 'Product name' }), 'Loose passata')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('a price-valued weighed code also asks for the weight, once', async () => {
    const onSave = setup('weighed_price')
    expect(screen.getByText(/\$2\.50/)).toBeInTheDocument()
    await pickIngredient('passata')
    await userEvent.type(screen.getByRole('textbox', { name: 'Product name' }), 'Loose passata')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).not.toHaveBeenCalled()
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Weight (g)' }), '500')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ weightText: '500' })
  })

  it('the field stack is a form with the scan-sheet-form class (CSS contract)', () => {
    setup()
    expect(screen.getByRole('dialog').querySelector('form')).toHaveClass('scan-sheet-form')
  })
})
