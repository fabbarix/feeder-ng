import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { flour, garlic } from '../fixtures.test-helper'
import type { LineDraft } from '../lib/draft'
import { IngredientLineRow, type IngredientLineRowProps } from './IngredientLineRow'

const line = (over: Partial<LineDraft> = {}): LineDraft => ({
  key: 'l1', ingredientId: 7, ingredientName: 'garlic', quantity: '3', unit: 'clove', optional: false, note: '', ...over,
})
const props = (over: Partial<IngredientLineRowProps> = {}): IngredientLineRowProps => ({
  line: line(), index: 0, errors: {}, ingredient: garlic, ingredients: [garlic, flour],
  onPick: vi.fn(), onChange: vi.fn(), onRemove: vi.fn(), ...over,
})
const view = (p = props()) => {
  render(<ul><IngredientLineRow {...p} /></ul>)
  return p
}

describe('IngredientLineRow', () => {
  it('uses only field primitives: no native select, checkbox or datalist', () => {
    view()
    expect(document.querySelector('select, datalist')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Ingredient' })).toHaveTextContent('garlic')
    expect(screen.getByRole('combobox', { name: 'Unit' })).toHaveTextContent('clove')
    expect(screen.getByRole('checkbox', { name: 'optional' })).not.toBeChecked()
  })

  it('picks an Ingredient from the IngredientSelect', async () => {
    const p = view(props({ line: line({ ingredientId: null, ingredientName: '', unit: '' }), ingredient: undefined }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Ingredient' }))
    await userEvent.click(screen.getByRole('option', { name: /flour/ }))
    expect(p.onPick).toHaveBeenCalledWith(flour)
  })

  it('chooses a unit of the Ingredient from the UnitSelect', async () => {
    const p = view()
    await userEvent.click(screen.getByRole('combobox', { name: 'Unit' }))
    await userEvent.click(screen.getByRole('option', { name: /^kg/ }))
    expect(p.onChange).toHaveBeenCalledWith({ unit: 'kg' })
  })

  it('asks for the pack size when a reused g or ml Ingredient leaves the Ready Meal quantity blank', () => {
    view(props({ line: line({ auto: true, ingredientId: 7, ingredientName: 'garlic', quantity: '', unit: 'g' }) }))
    expect(screen.getByText('Enter the pack size')).toBeInTheDocument()
  })
  it('gives no pack size hint once a quantity is typed or for an ordinary line', () => {
    view(props({ line: line({ auto: true, quantity: '500', unit: 'g' }) }))
    expect(screen.queryByText('Enter the pack size')).toBeNull()
  })

  it('has no Unit choice before an Ingredient is picked', () => {
    view(props({ line: line({ ingredientId: null, ingredientName: '', unit: '' }), ingredient: undefined }))
    expect(screen.getByRole('combobox', { name: 'Unit' })).toBeDisabled()
  })

  it('keeps fractions typeable in Quantity (a text field, "1 1/2")', async () => {
    const p = view(props({ line: line({ quantity: '' }) }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Quantity' }), '1/2')
    expect(p.onChange).toHaveBeenLastCalledWith({ quantity: '2' }) // controlled: one keystroke at a time
  })

  it('toggles optional and edits the note', async () => {
    const p = view()
    await userEvent.click(screen.getByRole('checkbox', { name: 'optional' }))
    expect(p.onChange).toHaveBeenCalledWith({ optional: true })
    await userEvent.type(screen.getByRole('textbox', { name: 'Note' }), 'x')
    expect(p.onChange).toHaveBeenLastCalledWith({ note: 'x' })
  })

  it('removes with an IconButton', async () => {
    const p = view()
    await userEvent.click(screen.getByRole('button', { name: 'Remove ingredient' }))
    expect(p.onRemove).toHaveBeenCalledOnce()
  })

  it('shows field errors on the field and as text', () => {
    view(props({ errors: { 'lines.0.quantity': 'quantity_invalid' } }))
    expect(screen.getByText('Enter a quantity above 0.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Quantity' })).toHaveAttribute('aria-invalid', 'true')
  })

  it('says a custom unit will need a Unit Conversion (G2)', () => {
    view(props({ line: line({ unit: 'handful' }) }))
    expect(screen.getByText('Feeder will ask how much 1 handful is when you save.')).toBeInTheDocument()
  })

  it('says nothing for a known unit', () => {
    view()
    expect(screen.queryByText(/Feeder will ask/)).toBeNull()
  })
})
