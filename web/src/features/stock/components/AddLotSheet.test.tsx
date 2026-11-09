import { render, screen } from '@testing-library/react'
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

describe('AddLotSheet', () => {
  it('lists the Ingredients to choose from', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Add a Stock Lot' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'chicken thighs' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'eggs' })).toBeInTheDocument()
  })

  it('submits Ingredient and quantity', async () => {
    const onSubmit = setup()
    await userEvent.selectOptions(screen.getByLabelText('Ingredient'), 'eggs')
    await userEvent.type(screen.getByLabelText('Quantity'), '6')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({ ingredientId: 8, quantity: 6 })
  })

  it('includes the purchase date when one is chosen', async () => {
    const onSubmit = setup()
    await userEvent.selectOptions(screen.getByLabelText('Ingredient'), 'chicken thighs')
    await userEvent.type(screen.getByLabelText('Quantity'), '800')
    await userEvent.type(screen.getByLabelText('Bought on'), '2026-11-07')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({ ingredientId: 7, quantity: 800, purchased: '2026-11-07' })
  })

  it.each([
    ['0', 'The amount must be more than zero'],
    ['-3', 'The amount cannot be negative'],
    ['', 'Enter an amount'],
    ['lots', 'Enter a number'],
  ])('rejects quantity %j', async (text, message) => {
    const onSubmit = setup()
    if (text) await userEvent.type(screen.getByLabelText('Quantity'), text)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
