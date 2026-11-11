// XS: the Add to Shopping List sheet is laid out like every other form sheet: full-width fields, the actions in the
// sheet's sticky footer (FormActions), the form owning its submit through the `form` attribute.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ExtraSheet } from './ExtraSheet'

const ingredients = [{ id: 1, name: 'milk', baseUnit: 'ml' }]
const open = () => render(<ExtraSheet open onClose={() => {}} ingredients={ingredients} onSubmit={() => {}} />)

describe('ExtraSheet layout', () => {
  it('Save and Cancel sit in the sheet footer, as one FormActions row, not in the body', () => {
    open()
    const dialog = screen.getByRole('dialog')
    const footer = dialog.querySelector('.sheet__footer')!
    expect(footer).not.toBeNull()
    expect(footer.querySelector('.form-actions__primary')).toContainElement(screen.getByRole('button', { name: 'Save' }))
    expect(footer.querySelector('.form-actions__tertiary')).toContainElement(screen.getByRole('button', { name: 'Cancel' }))
    expect(dialog.querySelector('.sheet__body')!.querySelector('.form-actions')).toBeNull()
  })

  it('the footer Save submits the body form through its form attribute', () => {
    open()
    const form = screen.getByRole('dialog').querySelector('form')!
    expect(form.id).not.toBe('')
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'submit')
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('form', form.id)
  })

  it('the form is the shop-sheet-form stack', () => {
    open()
    expect(screen.getByRole('dialog').querySelector('form')).toHaveClass('shop-sheet-form')
  })

  it('every field fills the sheet width (size full) in both modes', async () => {
    open()
    const sizes = () => [...screen.getByRole('dialog').querySelectorAll('.ui-field')].map((f) => f.getAttribute('data-size'))
    expect(sizes().length).toBeGreaterThanOrEqual(3) // the choice, the Ingredient, the Quantity
    expect(new Set(sizes())).toEqual(new Set(['full']))
    await userEvent.click(screen.getByRole('radio', { name: 'Something else' }))
    expect(new Set(sizes())).toEqual(new Set(['full']))
  })

  it('the Quantity sits in its own full-width row under the Ingredient (no side-by-side halves)', () => {
    open()
    const ingredient = screen.getByRole('combobox', { name: /Ingredient/ }).closest('.ui-field')!
    const quantity = screen.getByRole('spinbutton', { name: 'Quantity' }).closest('.ui-field')!
    expect(ingredient.compareDocumentPosition(quantity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(ingredient.parentElement).toBe(quantity.parentElement)
  })

  it('uses no native select, number or date input', () => {
    open()
    expect(document.querySelector('select, input[type=number], input[type=date]')).toBeNull()
  })
})
