import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { flour, garlic } from '../fixtures.test-helper'
import type { LineDraft } from '../lib/draft'
import { recipeStrings } from '../strings'
import { IngredientLineRow, type IngredientLineRowProps } from './IngredientLineRow'

const blankLine = (over: Partial<LineDraft> = {}): LineDraft => ({ key: 'l1', ingredientId: null, ingredientName: '', quantity: '', unit: '', optional: false, note: '', ...over })
const props = (over: Partial<IngredientLineRowProps> = {}): IngredientLineRowProps => ({
  line: blankLine(), index: 0, errors: {}, ingredient: undefined, ingredients: [garlic, flour],
  onPick: vi.fn(), onChange: vi.fn(), onRemove: vi.fn(), onQuickCreate: vi.fn(), ...over,
})
const view = (p: IngredientLineRowProps) => {
  render(<ul><IngredientLineRow {...p} /></ul>)
  return p
}
const ingredientBox = () => screen.getByRole('combobox', { name: 'Ingredient' })

describe('IngredientLineRow: Create Ingredient (R14)', () => {
  it('offers Create Ingredient "<typed name>" as the last option when nothing matches exactly', async () => {
    const p = view(props())
    await userEvent.click(ingredientBox())
    await userEvent.keyboard('saffron')
    const options = screen.getAllByRole('option')
    expect(options.at(-1)).toHaveAccessibleName('Create Ingredient "saffron"')
    await userEvent.click(options.at(-1)!)
    expect(p.onQuickCreate).toHaveBeenCalledWith('saffron')
    expect(p.onPick).not.toHaveBeenCalled()
  })
  it('does not offer it for the exact name of an existing Ingredient', async () => {
    view(props())
    await userEvent.click(ingredientBox())
    await userEvent.keyboard('GARLIC')
    expect(screen.queryByRole('option', { name: /^Create Ingredient/ })).toBeNull()
  })
  it('does not offer it at all when the screen gives no onQuickCreate', async () => {
    view(props({ onQuickCreate: undefined }))
    await userEvent.click(ingredientBox())
    await userEvent.keyboard('saffron')
    expect(screen.queryByRole('option', { name: /^Create Ingredient/ })).toBeNull()
  })
  it('offline: shows the option disabled with the reason, and choosing it does nothing', async () => {
    const p = view(props({ quickCreateDisabledReason: recipeStrings.quickCreate.offlineReason }))
    await userEvent.click(ingredientBox())
    await userEvent.keyboard('saffron')
    const row = screen.getByRole('option', { name: /Create Ingredient "saffron"/ })
    expect(row).toHaveAttribute('aria-disabled', 'true')
    expect(row).toHaveTextContent(recipeStrings.quickCreate.offlineReason)
    await userEvent.click(row)
    expect(p.onQuickCreate).not.toHaveBeenCalled()
  })
})

describe('IngredientLineRow: focus returns to the amount', () => {
  const picked = { line: blankLine({ ingredientId: 7, ingredientName: 'garlic', unit: 'g' }), ingredient: garlic }
  it('focuses Quantity when asked, and tells the screen once', () => {
    const onAmountFocused = vi.fn()
    view(props({ ...picked, focusAmount: true, onAmountFocused }))
    expect(screen.getByLabelText(recipeStrings.lines.quantity)).toHaveFocus()
    expect(onAmountFocused).toHaveBeenCalledOnce()
  })
  it('does not steal focus when not asked', () => {
    view(props(picked))
    expect(screen.getByLabelText(recipeStrings.lines.quantity)).not.toHaveFocus()
  })
})

describe('IngredientLineRow: the unit of a freshly created Ingredient', () => {
  it('reuses the G2 hint when the line unit is not convertible for it', () => {
    const fresh = { id: 99, name: 'Saffron', baseUnit: 'g' as const, conversions: [] }
    view(props({ line: blankLine({ ingredientId: 99, ingredientName: 'Saffron', quantity: '1', unit: 'pinch' }), ingredient: fresh }))
    expect(screen.getByText(recipeStrings.lines.unitNeedsConversion('pinch'))).toBeInTheDocument()
  })
  it('shows no hint when the unit fits the new Ingredient', () => {
    const fresh = { id: 99, name: 'Saffron', baseUnit: 'g' as const, conversions: [] }
    view(props({ line: blankLine({ ingredientId: 99, ingredientName: 'Saffron', quantity: '1', unit: 'kg' }), ingredient: fresh }))
    expect(screen.queryByText(/Feeder will ask how much/)).toBeNull()
  })
})

describe('IngredientLineRow: the pending Ready Meal line', () => {
  const pendingLine = blankLine({ ingredientName: 'Fish pie pack', quantity: '1', unit: 'piece', auto: true })
  it('shows the Ingredient to be added with its helper instead of a picker', () => {
    view(props({ line: pendingLine }))
    expect(screen.getByText('Fish pie pack')).toBeInTheDocument()
    expect(screen.getByText(recipeStrings.readyMealIngredient.newBadge)).toBeInTheDocument()
    expect(screen.getByText(recipeStrings.readyMealIngredient.helper('Fish pie pack'))).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Ingredient' })).toBeNull()
    expect(screen.queryByLabelText(recipeStrings.lines.quantity)).toBeNull()
  })
  it('"Choose another Ingredient" turns it into an ordinary blank line', async () => {
    const p = view(props({ line: pendingLine }))
    await userEvent.click(screen.getByRole('button', { name: recipeStrings.readyMealIngredient.changeIngredient }))
    expect(p.onChange).toHaveBeenCalledWith({ auto: false, ingredientName: '', quantity: '', unit: '' })
  })
  it('can still be removed', async () => {
    const p = view(props({ line: pendingLine }))
    await userEvent.click(screen.getByRole('button', { name: recipeStrings.lines.remove }))
    expect(p.onRemove).toHaveBeenCalled()
  })
  it('a reused Ingredient (ingredientId set) is an ordinary, editable row', () => {
    view(props({ line: blankLine({ ingredientId: 7, ingredientName: 'garlic', quantity: '1', unit: 'g', auto: true }), ingredient: garlic }))
    expect(ingredientBox()).toHaveTextContent('garlic')
    expect(screen.getByLabelText(recipeStrings.lines.quantity)).toHaveValue('1')
  })
})
