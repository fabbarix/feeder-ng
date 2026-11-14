// Beta.8 (scan): the short new-Product sheet names its Ingredient | Supply choice with a visible group label "What it is"
// (shop-scan-proposals.md 13.5, decision of 2026-11-13: label yes, picture chips kept instead of the mockup's radio). The
// chips are a radiogroup named by that label; they are Choice chips with an icon, never a native radio or the Segmented.
import { within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { dialog, kindGroup, lines, openSomethingElse, setup } from './newProduct.test-helper'

const label = () => within(dialog()).getByText('What it is')

describe('NewProductSheet: "What it is"', () => {
  it('shows the label above the choice, as visible text in the same style as "Pack size" and "Which Line is it?"', () => {
    setup()
    expect(label()).toBeVisible()
    expect(label()).toHaveClass('new-product__label')
    expect(label()).not.toHaveClass('visually-hidden')
    expect(label().compareDocumentPosition(kindGroup()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('the chips are a radiogroup labelled by that very text (aria-labelledby), not by a hidden copy', () => {
    setup()
    expect(label().id).not.toBe('')
    expect(kindGroup()).toHaveAttribute('aria-labelledby', label().id)
    expect(within(dialog()).getAllByText('What it is')).toHaveLength(1)
  })

  it('has the label on the "Something else" path of a sheet with Lines too, and not once a Line is picked', async () => {
    setup({ lines })
    expect(within(dialog()).queryByText('What it is')).toBeNull()
    await openSomethingElse()
    expect(label()).toBeVisible()
    expect(kindGroup()).toHaveAttribute('aria-labelledby', label().id)
  })

  it('keeps the picture chips: two Choice chips with an icon, and no native radio or Segmented', () => {
    setup()
    const radios = within(kindGroup()).getAllByRole('radio')
    expect(radios.map((r) => r.textContent)).toEqual(['Ingredient', 'Supply'])
    for (const r of radios) {
      expect(r).toHaveClass('choice-chip')
      expect(r.querySelector('svg')).not.toBeNull()
    }
    expect(dialog().querySelector('input[type=radio]')).toBeNull()
    expect(dialog().querySelector('.segmented')).toBeNull()
  })

  it('one is selected (aria-checked) and the other is not; Ingredient first', () => {
    setup()
    expect(within(kindGroup()).getByRole('radio', { name: 'Ingredient' })).toBeChecked()
    expect(within(kindGroup()).getByRole('radio', { name: 'Supply' })).not.toBeChecked()
  })

  it('picking Supply switches the choice and the Select under it', async () => {
    setup()
    await userEvent.click(within(kindGroup()).getByRole('radio', { name: 'Supply' }))
    expect(within(kindGroup()).getByRole('radio', { name: 'Supply' })).toBeChecked()
    expect(within(kindGroup()).getByRole('radio', { name: 'Ingredient' })).not.toBeChecked()
    expect(within(dialog()).getByRole('combobox', { name: /Supply/ })).toBeInTheDocument()
  })

  it('is one tab stop; the arrow keys move the selection (roving tabindex, as a radiogroup)', async () => {
    setup()
    const [ingredient, supply] = within(kindGroup()).getAllByRole('radio')
    expect(ingredient).toHaveAttribute('tabindex', '0')
    expect(supply).toHaveAttribute('tabindex', '-1')
    ingredient!.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(supply).toBeChecked()
    expect(supply).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(ingredient).toBeChecked()
  })

  it('the chips are real buttons (a keyboard Space or Enter picks)', async () => {
    setup()
    const supply = within(kindGroup()).getByRole('radio', { name: 'Supply' })
    expect(supply.tagName).toBe('BUTTON')
    supply.focus()
    await userEvent.keyboard('{Enter}')
    expect(supply).toBeChecked()
  })
})
