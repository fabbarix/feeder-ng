// Depends on PRIMITIVE REQUEST 1 (UnitSelect forwards onCreate/createLabel to Select). Red until that merges.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { garlic } from '../fixtures.test-helper'
import { IngredientLineRow } from './IngredientLineRow'

describe('IngredientLineRow: a unit the Ingredient does not know (G2)', () => {
  it('lets the User type a custom unit; the 422 unknown_unit flow then asks for the Unit Conversion', async () => {
    const onChange = vi.fn()
    render(
      <ul>
        <IngredientLineRow
          line={{ key: 'l', ingredientId: 7, ingredientName: 'garlic', quantity: '1', unit: 'g', optional: false, note: '' }}
          index={0}
          errors={{}}
          ingredient={garlic}
          ingredients={[garlic]}
          onPick={vi.fn()}
          onChange={onChange}
          onRemove={vi.fn()}
        />
      </ul>,
    )
    await userEvent.click(screen.getByRole('combobox', { name: 'Unit' }))
    await userEvent.keyboard('handful')
    await userEvent.click(screen.getByRole('option', { name: 'Use unit "handful"' }))
    expect(onChange).toHaveBeenCalledWith({ unit: 'handful' })
  })
})
