// B9-29 (SAFE-11, mock safe-11-add-lot-390-light.html): Add a Stock Lot never assumes anything.
//   - Ingredient: "Choose an Ingredient" (muted placeholder), focused on open; preselected only through the new prop
//     `initialIngredientId` (the sheet opened from that Ingredient's page); no `?? choices[0]`
//   - Quantity: empty, and no unit suffix until an Ingredient is chosen
//   - Bought on: today (the device's day: Tue 10 Nov 2026 here), so the submit always has `purchased`
//   - Storage Place: "Where it usually goes" (unchanged); Save stays enabled; missing fields get their own error line:
//     "Choose an Ingredient." (focus goes to the Ingredient select) and "Enter how much." (focus goes to Quantity)
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IngredientChoice } from '../types'
import { AddLotSheet } from './AddLotSheet'

const choices: IngredientChoice[] = [
  { id: 7, name: 'basil', baseUnit: 'g', kind: 'food', restockLevel: null },
  { id: 8, name: 'milk', baseUnit: 'ml', kind: 'food', restockLevel: null },
]

function setup(over: Partial<React.ComponentProps<typeof AddLotSheet>> = {}) {
  const onSubmit = vi.fn()
  render(<AddLotSheet open onClose={() => {}} choices={choices} onSubmit={onSubmit} {...over} />)
  return { onSubmit, sheet: screen.getByRole('dialog', { name: 'Add a Stock Lot' }) }
}
const ingredient = () => screen.getByRole('combobox', { name: 'Ingredient' })

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-11-10T12:00:00'))
})
afterEach(() => vi.useRealTimers())

describe('AddLotSheet starts empty', () => {
  it('shows the placeholder "Choose an Ingredient" and focuses the Ingredient select on open', () => {
    setup()
    expect(ingredient()).toHaveTextContent('Choose an Ingredient')
    expect(ingredient()).toHaveAttribute('data-placeholder')
    expect(ingredient()).toHaveFocus()
  })
  it('has an empty Quantity with no unit suffix until an Ingredient is chosen', async () => {
    const { sheet } = setup()
    expect(screen.getByLabelText('Quantity')).toHaveValue('')
    expect(sheet.querySelector('.ui-field__suffix')).toBeNull()
    await userEvent.click(ingredient())
    await userEvent.click(await screen.findByRole('option', { name: /milk/ }))
    expect(within(sheet).getByText('ml', { selector: '.ui-field__suffix' })).toBeInTheDocument()
  })
  it('Bought on starts at today', () => {
    setup()
    expect(screen.getByRole('button', { name: /Bought on/ })).toHaveTextContent(/10 Nov/)
  })
  it('an Ingredient is preselected only when the sheet is opened from its page (initialIngredientId)', () => {
    setup({ initialIngredientId: 8 })
    expect(ingredient()).toHaveTextContent('milk')
    expect(ingredient()).not.toHaveAttribute('data-placeholder')
    expect(within(screen.getByRole('dialog')).getByText('ml', { selector: '.ui-field__suffix' })).toBeInTheDocument()
  })
  it('an initialIngredientId that is not among the choices preselects nothing', () => {
    setup({ initialIngredientId: 999 })
    expect(ingredient()).toHaveTextContent('Choose an Ingredient')
  })
})

describe('AddLotSheet Save is never disabled; it says what is missing', () => {
  it('Save is enabled with nothing filled in, and pressing it asks for the Ingredient first, focusing it', async () => {
    const { onSubmit } = setup()
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeEnabled()
    await userEvent.click(save)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Choose an Ingredient.')).toBeInTheDocument()
    expect(ingredient()).toHaveAttribute('aria-invalid', 'true')
    expect(ingredient()).toHaveFocus()
  })
  it('with an Ingredient and no quantity it says "Enter how much." and focuses Quantity', async () => {
    const { onSubmit } = setup({ initialIngredientId: 7 })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Enter how much.')).toBeInTheDocument()
    expect(screen.getByLabelText('Quantity')).toHaveFocus()
  })
  it('choosing the Ingredient clears its error', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await userEvent.click(ingredient())
    await userEvent.click(await screen.findByRole('option', { name: /basil/ }))
    expect(screen.queryByText('Choose an Ingredient.')).toBeNull()
  })
  it('a complete form submits the chosen Ingredient, the quantity and today', async () => {
    const { onSubmit } = setup()
    await userEvent.click(ingredient())
    await userEvent.click(await screen.findByRole('option', { name: /basil/ }))
    await userEvent.type(screen.getByLabelText('Quantity'), '30')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({ ingredientId: 7, quantity: 30, purchased: '2026-11-10' })
  })
  it('opened again after a close it starts empty again (the screen keeps the sheet mounted)', async () => {
    const onSubmit = vi.fn()
    const { rerender } = render(<AddLotSheet open onClose={() => {}} choices={choices} onSubmit={onSubmit} />)
    await userEvent.click(ingredient())
    await userEvent.click(await screen.findByRole('option', { name: /basil/ }))
    rerender(<AddLotSheet open={false} onClose={() => {}} choices={choices} onSubmit={onSubmit} />)
    rerender(<AddLotSheet open onClose={() => {}} choices={choices} onSubmit={onSubmit} />)
    expect(ingredient()).toHaveTextContent('Choose an Ingredient')
  })
})
