import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ExtraSheet } from './ExtraSheet'

const ingredients = [
  { id: 1, name: 'milk', baseUnit: 'ml' },
  { id: 2, name: 'passata', baseUnit: 'g' },
]

function setup(props: Partial<React.ComponentProps<typeof ExtraSheet>> = {}) {
  const onSubmit = vi.fn()
  const onClose = vi.fn()
  render(<ExtraSheet open onClose={onClose} ingredients={ingredients} onSubmit={onSubmit} {...props} />)
  return { onSubmit, onClose }
}

async function pick(name: string) {
  await userEvent.click(screen.getByRole('combobox', { name: /Ingredient/ }))
  await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: new RegExp(name) }))
}
const note = () => userEvent.click(screen.getByRole('radio', { name: 'Something else' }))
const save = () => userEvent.click(screen.getByRole('button', { name: 'Save' }))

describe('ExtraSheet: one choice, two modes', () => {
  it('has no native select', () => {
    setup()
    expect(document.querySelector('select')).toBeNull()
  })

  it('asks "What are you adding?" as a Segmented choice: Ingredient (default) or Something else', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Add to Shopping List' })).toBeInTheDocument()
    const group = screen.getByRole('radiogroup', { name: 'What are you adding?' })
    expect(within(group).getByRole('radio', { name: 'Ingredient' })).toHaveAttribute('aria-checked', 'true')
    expect(within(group).getByRole('radio', { name: 'Something else' })).toHaveAttribute('aria-checked', 'false')
  })

  it('explains the difference in the choice helper: an Ingredient goes to Stock when ticked, anything else is a reminder', () => {
    setup()
    expect(screen.getByRole('radiogroup', { name: 'What are you adding?' })).toHaveAccessibleDescription(/Stock/)
  })

  it('Ingredient mode shows the Ingredient select and the Quantity, and no free-text field', () => {
    setup()
    expect(screen.getByRole('combobox', { name: /Ingredient/ })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Something to buy')).toBeNull()
  })

  it('the Quantity is visible but disabled until an Ingredient is chosen, then shows its Base Unit', async () => {
    setup()
    expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toBeDisabled()
    await pick('milk')
    expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toBeEnabled()
    expect(screen.getByText('ml')).toBeInTheDocument()
  })

  it('Something else mode shows only the "Something to buy" text field', async () => {
    setup()
    await note()
    expect(screen.getByLabelText('Something to buy')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('spinbutton', { name: 'Quantity' })).toBeNull()
  })

  it('defaults to Something else, with Ingredient disabled, when there are no Ingredients to pick', () => {
    setup({ ingredients: [] })
    expect(screen.getByRole('radio', { name: 'Something else' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Ingredient' })).toBeDisabled()
  })
})

describe('ExtraSheet: submitting', () => {
  it('adds a free-text extra', async () => {
    const { onSubmit } = setup()
    await note()
    await userEvent.type(screen.getByLabelText('Something to buy'), '  toilet paper ')
    await save()
    expect(onSubmit).toHaveBeenCalledWith({ text: 'toilet paper' })
  })

  it('adds an Ingredient with a quantity', async () => {
    const { onSubmit } = setup()
    await pick('milk')
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Quantity' }), '2000')
    await save()
    expect(onSubmit).toHaveBeenCalledWith({ ingredientId: 1, quantity: 2000 })
  })

  it('Enter in the Quantity field saves', async () => {
    const { onSubmit } = setup()
    await pick('passata')
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Quantity' }), '700{Enter}')
    expect(onSubmit).toHaveBeenCalledWith({ ingredientId: 2, quantity: 700 })
  })

  it('Enter in the text field saves', async () => {
    const { onSubmit } = setup()
    await note()
    await userEvent.type(screen.getByLabelText('Something to buy'), 'candles{Enter}')
    expect(onSubmit).toHaveBeenCalledWith({ text: 'candles' })
  })

  it('text typed in Something else is not sent when the User switches back to an Ingredient', async () => {
    const { onSubmit } = setup()
    await note()
    await userEvent.type(screen.getByLabelText('Something to buy'), 'candles')
    await userEvent.click(screen.getByRole('radio', { name: 'Ingredient' }))
    await pick('milk')
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Quantity' }), '5')
    await save()
    expect(onSubmit).toHaveBeenCalledWith({ ingredientId: 1, quantity: 5 })
  })

  it('Cancel closes without saving', async () => {
    const { onSubmit, onClose } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('ExtraSheet: validation (inline, on the field at fault)', () => {
  it('Ingredient mode with nothing chosen asks for an Ingredient on the select', async () => {
    const { onSubmit } = setup()
    await save()
    expect(screen.getByRole('combobox', { name: /Ingredient/ })).toHaveAccessibleDescription('Choose an Ingredient')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('an Ingredient needs a quantity above zero, shown on the Quantity field', async () => {
    const { onSubmit } = setup()
    await pick('passata')
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Quantity' }), '0')
    await save()
    expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toHaveAccessibleDescription('Enter a number above 0')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('an empty quantity is refused too', async () => {
    const { onSubmit } = setup()
    await pick('passata')
    await save()
    expect(screen.getByText('Enter a number above 0')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Something else needs text', async () => {
    const { onSubmit } = setup()
    await note()
    await save()
    expect(screen.getByLabelText('Something to buy')).toHaveAccessibleDescription('Required')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('switching mode clears an error', async () => {
    setup()
    await save()
    expect(screen.getByText('Choose an Ingredient')).toBeInTheDocument()
    await note()
    expect(screen.queryByText('Choose an Ingredient')).toBeNull()
  })
})

describe('ExtraSheet: reopening', () => {
  it('starts clean each time it opens', async () => {
    const onSubmit = vi.fn()
    const { rerender } = render(<ExtraSheet open onClose={() => {}} ingredients={ingredients} onSubmit={onSubmit} />)
    await note()
    await userEvent.type(screen.getByLabelText('Something to buy'), 'candles')
    rerender(<ExtraSheet open={false} onClose={() => {}} ingredients={ingredients} onSubmit={onSubmit} />)
    rerender(<ExtraSheet open onClose={() => {}} ingredients={ingredients} onSubmit={onSubmit} />)
    expect(screen.getByRole('radio', { name: 'Ingredient' })).toHaveAttribute('aria-checked', 'true')
    await note()
    expect(screen.getByLabelText('Something to buy')).toHaveValue('')
  })
})
