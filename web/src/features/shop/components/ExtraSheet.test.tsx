import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ExtraSheet } from './ExtraSheet'

const ingredients = [
  { id: 1, name: 'milk' },
  { id: 2, name: 'passata' },
]

function setup() {
  const onSubmit = vi.fn()
  render(<ExtraSheet open onClose={() => {}} ingredients={ingredients} onSubmit={onSubmit} />)
  return onSubmit
}

describe('ExtraSheet', () => {
  it('adds a free-text extra', async () => {
    const onSubmit = setup()
    expect(screen.getByRole('dialog', { name: 'Add an extra' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Something to buy'), '  toilet paper ')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({ text: 'toilet paper' })
  })

  it('adds an Ingredient with a quantity', async () => {
    const onSubmit = setup()
    await userEvent.selectOptions(screen.getByLabelText('Ingredient'), 'milk')
    await userEvent.type(screen.getByLabelText('Quantity'), '2000')
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
    await userEvent.selectOptions(screen.getByLabelText('Ingredient'), 'passata')
    await userEvent.type(screen.getByLabelText('Quantity'), '0')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Enter a number above 0')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
