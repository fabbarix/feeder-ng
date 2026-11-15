// B9-43 (SSP-14, D6-A): "Get something else…" opens Add to Shopping List with the Ingredient select already open, so the person only picks
// the replacement. `autoOpenIngredient` starts on the Ingredient choice (when there are Ingredients) and opens the select on mount;
// choosing an option closes it as usual; without the prop nothing opens (the default sheet is unchanged).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ExtraSheet } from './ExtraSheet'

Element.prototype.scrollIntoView ??= () => {}

const ingredients = [
  { id: 6, name: 'shallot', baseUnit: 'piece' },
  { id: 2, name: 'passata', baseUnit: 'g' },
]
const trigger = () => screen.getByRole('combobox', { name: /Ingredient/ })

describe('ExtraSheet: autoOpenIngredient (SSP-14)', () => {
  it('opens with the Ingredient select open: its listbox is showing and the trigger says expanded', () => {
    render(<ExtraSheet open autoOpenIngredient onClose={() => {}} ingredients={ingredients} onSubmit={() => {}} />)
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('picking the replacement closes the list and enables the Quantity in its unit; Save submits the extra', async () => {
    const onSubmit = vi.fn()
    render(<ExtraSheet open autoOpenIngredient onClose={() => {}} ingredients={ingredients} onSubmit={onSubmit} />)
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /Shallot/ }))
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Quantity' }), '12')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ ingredientId: 6, quantity: 12 })
  })

  it('without the prop the select stays closed (the default Add to Shopping List is unchanged)', () => {
    render(<ExtraSheet open onClose={() => {}} ingredients={ingredients} onSubmit={() => {}} />)
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('it opens again each time the sheet is reopened (the screen keeps the sheet mounted)', () => {
    const { rerender } = render(<ExtraSheet open autoOpenIngredient onClose={() => {}} ingredients={ingredients} onSubmit={() => {}} />)
    rerender(<ExtraSheet open={false} autoOpenIngredient onClose={() => {}} ingredients={ingredients} onSubmit={() => {}} />)
    rerender(<ExtraSheet open autoOpenIngredient onClose={() => {}} ingredients={ingredients} onSubmit={() => {}} />)
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
  })
})
