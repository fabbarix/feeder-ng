// B9-34 (SAFE-11, R5, Add to Shopping List): no arbitrary default. The Ingredient select shows the muted placeholder "Choose an
// Ingredient"; the disabled Quantity says why ("Choose the Ingredient first; the quantity is in its unit."); Save stays enabled and a
// missing field gets its error and the focus (R4, useFocusFirstInvalid).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ExtraSheet } from './ExtraSheet'

// jsdom has no scrollIntoView; a failed Save scrolls the invalid field into view before focusing it (useFocusFirstInvalid, SAFE-11)
Element.prototype.scrollIntoView ??= () => {}

const ingredients = [
  { id: 1, name: 'milk', baseUnit: 'ml' },
  { id: 2, name: 'passata', baseUnit: 'g' },
]
function setup() {
  const onSubmit = vi.fn()
  render(<ExtraSheet open onClose={() => {}} ingredients={ingredients} onSubmit={onSubmit} />)
  return { onSubmit }
}
const trigger = () => screen.getByRole('combobox', { name: /Ingredient/ })

describe('ExtraSheet: defaults (SAFE-11)', () => {
  it('the Ingredient select reads "Choose an Ingredient" as a muted placeholder, with nothing chosen', () => {
    setup()
    expect(trigger()).toHaveTextContent('Choose an Ingredient')
    expect(trigger()).toHaveAttribute('data-placeholder')
  })

  it('the disabled Quantity explains itself: "Choose the Ingredient first; the quantity is in its unit."', () => {
    setup()
    const quantity = screen.getByRole('spinbutton', { name: 'Quantity' })
    expect(quantity).toBeDisabled()
    expect(quantity).toHaveAccessibleDescription(/Choose the Ingredient first; the quantity is in its unit\./)
  })

  it('once an Ingredient is chosen the helper is gone and the Quantity shows its unit', async () => {
    setup()
    await userEvent.click(trigger())
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /Milk|milk/ }))
    expect(screen.queryByText(/Choose the Ingredient first/)).toBeNull()
    expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toBeEnabled()
    expect(screen.getByText('ml')).toBeInTheDocument()
  })

  it('Save is enabled with nothing filled; it shows "Choose an Ingredient" on the field and focuses it', async () => {
    const { onSubmit } = setup()
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeEnabled()
    await userEvent.click(save)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(trigger()).toHaveFocus()
    expect(trigger()).toBeInvalid()
  })

  it('a missing quantity is the second error, and takes the focus', async () => {
    setup()
    await userEvent.click(trigger())
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /Milk|milk/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toHaveFocus()
    expect(screen.getByText('Enter a number above 0')).toBeInTheDocument()
  })
})
