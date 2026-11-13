// SR5: accessibility of the new-Product sheet: a <dialog>, real buttons, labelled fields, inline validation hints.
import { within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { addButton, choose, dialog, kindGroup, lineGroup, lines, packGroup, setup } from './newProduct.test-helper'

describe('NewProductSheet: accessibility', () => {
  it('is a <dialog> named "What is this?"', () => {
    setup({ lines })
    expect(dialog().tagName).toBe('DIALOG')
  })

  it('renders nothing while closed', () => {
    setup({ open: false })
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('every control has an accessible name, and nothing in the sheet is a div button', () => {
    setup({ lines })
    for (const b of dialog().querySelectorAll('button')) expect((b.textContent ?? '').trim() !== '' || b.getAttribute('aria-label')).toBeTruthy()
    expect(dialog().querySelector('[onclick], div[role=button], span[role=button]')).toBeNull()
  })

  it('the Line chips, the kind choice and the pack chips are named groups', async () => {
    setup({ lines })
    expect(lineGroup()).toBeInTheDocument()
    await userEvent.click(within(lineGroup()).getByRole('button', { name: 'Something else' }))
    expect(kindGroup()).toBeInTheDocument()
    await choose(/Ingredient/, /^milk/)
    expect(packGroup()).toBeInTheDocument()
  })

  it('the selected pack chip says so with aria-pressed, not by colour alone', async () => {
    setup()
    await choose(/Ingredient/, /^milk/)
    await userEvent.click(within(packGroup()).getByRole('button', { name: '1 l' }))
    expect(within(packGroup()).getByRole('button', { name: '1 l' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('Add on an empty form shows inline hints and no onSave: "Pick what it is" on the Select', async () => {
    const { props } = setup()
    await userEvent.click(addButton())
    expect(props.onSave).not.toHaveBeenCalled()
    const select = within(dialog()).getByRole('combobox', { name: /Ingredient/ })
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAccessibleDescription('Pick what it is')
  })

  it('and "Pick a pack size" on the chips, once an Ingredient is chosen', async () => {
    const { props } = setup()
    await choose(/Ingredient/, /^milk/)
    await userEvent.click(addButton())
    expect(props.onSave).not.toHaveBeenCalled()
    expect(packGroup()).toHaveAccessibleDescription('Pick a pack size')
    expect(packGroup()).toHaveAttribute('aria-invalid', 'true')
  })

  it('the hint goes once the size is picked', async () => {
    setup()
    await choose(/Ingredient/, /^milk/)
    await userEvent.click(addButton())
    await userEvent.click(within(packGroup()).getByRole('button', { name: '1 l' }))
    expect(packGroup()).not.toHaveAccessibleDescription('Pick a pack size')
  })

  it('an Other size of 0 is refused: "Enter a number above 0" on the number field', async () => {
    const { props } = setup()
    await choose(/Ingredient/, /^milk/)
    await userEvent.click(within(packGroup()).getByRole('button', { name: 'Other' }))
    await userEvent.type(within(dialog()).getByRole('spinbutton', { name: 'Other pack size' }), '0')
    await userEvent.click(addButton())
    expect(props.onSave).not.toHaveBeenCalled()
    expect(within(dialog()).getByRole('spinbutton', { name: 'Other pack size' })).toHaveAccessibleDescription('Enter a number above 0')
  })

  it('moves focus to the first field with a hint when Add is refused', async () => {
    setup()
    await userEvent.click(addButton())
    expect(within(dialog()).getByRole('combobox', { name: /Ingredient/ })).toHaveFocus()
  })

  it('Escape closes the sheet', async () => {
    const { props } = setup()
    await userEvent.keyboard('{Escape}')
    expect(props.onClose).toHaveBeenCalled()
  })

  it('the primary Add is reachable by keyboard after the chips (tab order follows the reading order)', async () => {
    setup()
    await choose(/Ingredient/, /^milk/)
    const order = Array.from(dialog().querySelectorAll('button, [role=combobox], input:not([hidden])')).map((e) => e.textContent || e.getAttribute('aria-label') || '')
    expect(order.indexOf('1 l')).toBeGreaterThan(-1)
    expect(order.indexOf('1 l')).toBeLessThan(order.findIndex((t) => t === 'Add'))
  })
})
