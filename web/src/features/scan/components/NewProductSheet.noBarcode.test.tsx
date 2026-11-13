// The sheet without a barcode (receipt-reading 3.4, the review's Add…): no barcode line, no Picture, the Line chips still shown; it
// opens with the receipt line's name and size, and Add only hands its values back (onAdded is never called: no row to price).
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { addButton, dialog, ingredients, lineGroup, lines, setup } from './newProduct.test-helper'

describe('NewProductSheet without a barcode', () => {
  it('shows no barcode line and no Picture, even when a barcode is passed; the Line chips still show', async () => {
    setup({ noBarcode: true, lines })
    expect(within(dialog()).queryByText(/8001234567890/)).toBeNull()
    expect(within(lineGroup()).getByRole('button', { name: /^Eggs/ })).toBeInTheDocument()
    await userEvent.click(within(lineGroup()).getByRole('button', { name: /^Eggs/ }))
    expect(within(dialog()).queryByRole('button', { name: /Picture/ })).toBeNull()
  })

  it('Add hands the values back with the receipt line\'s name and size, and never calls onAdded', async () => {
    const { props } = setup({ noBarcode: true, lines, initial: { productName: 'Pane casereccio', packSize: 450, packUnit: 'g' } })
    await userEvent.click(within(lineGroup()).getByRole('button', { name: 'Something else' }))
    await userEvent.click(within(dialog()).getByRole('combobox', { name: /Ingredient/ }))
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /^passata/ }))
    expect(within(dialog()).getByRole('spinbutton', { name: 'Other pack size' })).toHaveDisplayValue('450')
    await userEvent.click(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1))
    expect(props.onSave.mock.calls[0]?.[0]).toMatchObject({ ingredient: { id: 1 }, packSize: '450', packUnit: 'g', productName: 'Pane casereccio', scope: 'global' })
    expect(props.onAdded).not.toHaveBeenCalled()
  })

  it('an Add edited again opens on its Ingredient, past the Line chips', () => {
    setup({ noBarcode: true, lines, initial: { ingredient: ingredients[3], productName: 'Eggs 6', packSize: 6, packUnit: 'piece', scope: 'shop' } })
    expect(within(dialog()).queryByRole('group', { name: 'Which Line is it?' })).toBeNull()
    expect(within(dialog()).getByText(/Eggs 6/)).toBeInTheDocument()
    expect(addButton()).toBeInTheDocument()
  })
})
