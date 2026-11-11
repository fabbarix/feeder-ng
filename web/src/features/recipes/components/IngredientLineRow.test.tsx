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
    // E-01: Optional lives in the actions menu as a checkable item, never as a checkbox or a toggle button on the line.
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Optional/ })).toBeNull()
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
    expect(screen.getByText('Enter the pack size.')).toBeInTheDocument()
  })
  it('links the pack size hint to the Quantity field', () => {
    view(props({ line: line({ auto: true, ingredientId: 7, quantity: '', unit: 'g' }) }))
    const hint = screen.getByText('Enter the pack size.')
    expect(hint.id).not.toBe('')
    expect(screen.getByRole('textbox', { name: 'Quantity' })).toHaveAccessibleDescription('Enter the pack size.')
  })
  it('gives no pack size hint once a quantity is typed or for an ordinary line', () => {
    view(props({ line: line({ auto: true, quantity: '500', unit: 'g' }) }))
    expect(screen.queryByText('Enter the pack size.')).toBeNull()
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
    await userEvent.click(screen.getByRole('button', { name: 'Actions for garlic' }))
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Optional' }))
    expect(p.onChange).toHaveBeenCalledWith({ optional: true })
    await userEvent.type(screen.getByRole('textbox', { name: 'Note' }), 'x')
    expect(p.onChange).toHaveBeenLastCalledWith({ note: 'x' })
  })

  it('removes with an IconButton', async () => {
    const p = view()
    await userEvent.click(screen.getByRole('button', { name: 'Remove ingredient garlic' }))
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

describe('IngredientLineRow: unique button names across lines', () => {
  it('Actions and Remove name their Ingredient, or their line number before one is picked', () => {
    render(
      <ul>
        <IngredientLineRow {...props()} />
        <IngredientLineRow {...props({ line: line({ key: 'l2', ingredientId: 8, ingredientName: 'flour' }), ingredient: flour, index: 1 })} />
        <IngredientLineRow {...props({ line: line({ key: 'l3', ingredientId: null, ingredientName: '', unit: '' }), ingredient: undefined, index: 2 })} />
      </ul>,
    )
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim())
    const own = names.filter((n) => /^(Actions for|Remove ingredient)/.test(n ?? ''))
    expect(new Set(own).size).toBe(own.length)
    for (const n of ['Actions for garlic', 'Remove ingredient garlic', 'Actions for flour', 'Remove ingredient flour', 'Actions for line 3', 'Remove ingredient line 3']) {
      expect(own, n).toContain(n)
    }
  })
})

describe('IngredientLineRow: structure for the two-row phone layout', () => {
  it('Ingredient, Quantity, Unit, Note and remove are direct children of the row, each in its own cell', () => {
    const { container } = render(<ul><IngredientLineRow {...props()} /></ul>)
    const row = container.querySelector('li.line-row')!
    const cells = ['ingredient', 'quantity', 'unit', 'note', 'remove']
    expect([...row.children].map((c) => c.className)).toEqual(cells.map((c) => `line-row__${c}`))
    expect(row.querySelector('.line-row__remove button')).toHaveAccessibleName('Remove ingredient garlic')
    expect(row.querySelector('.line-row__optional')).toBeNull()
    expect(row.querySelector('.line-row__remove button[aria-haspopup="menu"]')).toHaveAccessibleName('Actions for garlic')
  })
  it('the unit-conversion hint sits between the cells as its own full-width item', () => {
    const { container } = render(<ul><IngredientLineRow {...props({ line: line({ unit: 'bunch' }) })} /></ul>)
    expect(container.querySelector('li.line-row > .line-row__hint')).not.toBeNull()
  })
})
