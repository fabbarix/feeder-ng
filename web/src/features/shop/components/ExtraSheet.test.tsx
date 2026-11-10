import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ExtraSheet } from './ExtraSheet'

const ingredients = [
  { id: 1, name: 'milk', baseUnit: 'ml' },
  { id: 2, name: 'passata', baseUnit: 'g' },
]

function setup() {
  const onSubmit = vi.fn()
  render(<ExtraSheet open onClose={() => {}} ingredients={ingredients} onSubmit={onSubmit} />)
  return onSubmit
}

async function pick(name: string) {
  await userEvent.click(screen.getByRole('combobox', { name: /Ingredient/ }))
  await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: new RegExp(name) }))
}

describe('ExtraSheet', () => {
  it('has no native select', () => {
    setup()
    expect(document.querySelector('select')).toBeNull()
  })

  it('adds a free-text extra', async () => {
    const onSubmit = setup()
    expect(screen.getByRole('dialog', { name: 'Add an extra' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Something to buy'), '  toilet paper ')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({ text: 'toilet paper' })
  })

  it('adds an Ingredient (an IngredientSelect) with a quantity (a NumberField showing the Base Unit)', async () => {
    const onSubmit = setup()
    await pick('milk')
    expect(screen.getByText('ml')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Quantity' }), '2000')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({ ingredientId: 1, quantity: 2000 })
  })

  it('needs something', async () => {
    const onSubmit = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Required')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('an Ingredient needs a quantity above zero', async () => {
    const onSubmit = setup()
    await pick('passata')
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Quantity' }), '0')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Enter a number above 0')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('text and an Ingredient together are refused', async () => {
    const onSubmit = setup()
    await userEvent.type(screen.getByLabelText('Something to buy'), 'candles')
    await pick('milk')
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Quantity' }), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Choose text or an Ingredient, not both')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
