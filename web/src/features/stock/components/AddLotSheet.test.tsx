import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AddLotSheet } from './AddLotSheet'

const choices = [
  { id: 7, name: 'chicken thighs', baseUnit: 'g' as const },
  { id: 8, name: 'eggs', baseUnit: 'piece' as const },
]

function setup() {
  const onSubmit = vi.fn()
  render(<AddLotSheet open onClose={() => {}} choices={choices} onSubmit={onSubmit} />)
  return onSubmit
}

/** Opens the IngredientSelect and picks an option by name. */
async function pickIngredient(name: string) {
  await userEvent.click(screen.getByRole('combobox', { name: 'Ingredient' }))
  await userEvent.click(await screen.findByRole('option', { name }))
}

describe('AddLotSheet', () => {
  it('uses the shared IngredientSelect, not a native select or date input', () => {
    setup()
    const sheet = screen.getByRole('dialog', { name: 'Add a Stock Lot' })
    expect(sheet.querySelector('select, option, input[type="date"]')).toBeNull()
    expect(within(sheet).getByRole('combobox', { name: 'Ingredient' })).toBeInTheDocument()
  })

  it('defaults to the first Ingredient and lists all of them when opened', async () => {
    setup()
    expect(screen.getByRole('combobox', { name: 'Ingredient' })).toHaveTextContent('chicken thighs')
    await userEvent.click(screen.getByRole('combobox', { name: 'Ingredient' }))
    expect(await screen.findByRole('option', { name: /chicken thighs/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /eggs/ })).toBeInTheDocument()
  })

  it('shows the chosen Ingredient\'s Base Unit beside Quantity', async () => {
    setup()
    expect(screen.getByText('g', { selector: '.ui-field__suffix' })).toBeInTheDocument()
    await pickIngredient('eggs')
    expect(screen.getByText('piece', { selector: '.ui-field__suffix' })).toBeInTheDocument()
  })

  it('submits Ingredient and quantity', async () => {
    const onSubmit = setup()
    await pickIngredient('eggs')
    await userEvent.type(screen.getByLabelText('Quantity'), '6')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({ ingredientId: 8, quantity: 6 })
  })

  it('includes the purchase date picked in the DateField', async () => {
    const onSubmit = setup()
    await userEvent.type(screen.getByLabelText('Quantity'), '800')
    await userEvent.click(screen.getByRole('button', { name: /Bought on/ }))
    await userEvent.click(await screen.findByRole('button', { name: /7 November/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({ ingredientId: 7, quantity: 800, purchased: expect.stringMatching(/^\d{4}-11-07$/) })
  })

  it('omits purchased when no date is chosen', async () => {
    const onSubmit = setup()
    await userEvent.type(screen.getByLabelText('Quantity'), '3')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit.mock.calls[0]![0]).not.toHaveProperty('purchased')
  })

  it.each([
    ['0', 'The amount must be more than zero'],
    ['-3', 'The amount cannot be negative'],
    ['', 'Enter an amount'],
    ['lots', 'Enter a number'],
  ])('rejects quantity %j with the field error', async (text, message) => {
    const onSubmit = setup()
    if (text) await userEvent.type(screen.getByLabelText('Quantity'), text)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.getByLabelText('Quantity')).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('has exactly one primary Button', () => {
    setup()
    const sheet = screen.getByRole('dialog')
    expect(sheet.querySelectorAll('button[data-variant="primary"]')).toHaveLength(1)
  })
})
