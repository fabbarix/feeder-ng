// SR5 (13.5 step 3): pack-size chips from the Ingredient's Base Unit and known Products, plus Other.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { addButton, choose, dialog, packGroup, setup } from './newProduct.test-helper'

const chips = () => within(packGroup()).getAllByRole('button').map((b) => b.textContent ?? '')
const chip = (name: string) => within(packGroup()).getByRole('button', { name })

describe('NewProductSheet: pack size', () => {
  it('suggests the common sizes of the Base Unit: g -> 250 g, 500 g, 1 kg, then Other', async () => {
    setup()
    await choose(/Ingredient/, /^passata/)
    expect(chips()).toEqual(['250 g', '500 g', '1 kg', 'Other'])
  })

  it('ml -> 500 ml, 1 l, Other (the 390 px mockup)', async () => {
    setup()
    await choose(/Ingredient/, /^milk/)
    expect(chips()).toEqual(['500 ml', '1 l', 'Other'])
  })

  it('piece -> 1 piece, 4 pieces, 6 pieces, 10 pieces', async () => {
    setup()
    await choose(/Ingredient/, /^Eggs/)
    expect(chips()).toEqual(['1 piece', '4 pieces', '6 pieces', '10 pieces', 'Other'])
  })

  it('puts the sizes of the Ingredient\'s known Products first, and ignores other Ingredients\' Products', async () => {
    setup({
      products: [
        { ingredientId: 1, packSize: 700 },
        { ingredientId: 1, packSize: 400 },
        { ingredientId: 2, packSize: 1000 },
      ],
    })
    await choose(/Ingredient/, /^passata/)
    expect(chips()).toEqual(['400 g', '700 g', '250 g', '500 g', '1 kg', 'Other'])
  })

  it('preselects the size when the Ingredient has one usual size, and not otherwise', async () => {
    setup({ products: [{ ingredientId: 1, packSize: 700 }, { ingredientId: 1, packSize: 700 }] })
    await choose(/Ingredient/, /^passata/)
    expect(chip('700 g')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('500 g')).toHaveAttribute('aria-pressed', 'false')
  })

  it('preselects nothing without a known size (the User picks one)', async () => {
    setup()
    await choose(/Ingredient/, /^passata/)
    for (const b of within(packGroup()).getAllByRole('button')) expect(b).toHaveAttribute('aria-pressed', 'false')
  })

  it('tapping a chip selects it and a second chip replaces it', async () => {
    setup()
    await choose(/Ingredient/, /^milk/)
    await userEvent.click(chip('500 ml'))
    expect(chip('500 ml')).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(chip('1 l'))
    expect(chip('500 ml')).toHaveAttribute('aria-pressed', 'false')
    expect(chip('1 l')).toHaveAttribute('aria-pressed', 'true')
  })

  it('Other opens a number field and a unit Select of the Base Unit\'s units', async () => {
    setup()
    await choose(/Ingredient/, /^passata/)
    expect(within(dialog()).queryByRole('spinbutton', { name: 'Other pack size' })).toBeNull()
    await userEvent.click(chip('Other'))
    expect(within(dialog()).getByRole('spinbutton', { name: 'Other pack size' })).toBeInTheDocument()
    await userEvent.click(within(dialog()).getByRole('combobox', { name: 'Unit' }))
    const names = within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent ?? '')
    expect(names.join(' ')).toMatch(/\bkg\b/)
    expect(names.join(' ')).not.toMatch(/\bml\b/)
  })

  it('a size typed under Other is the pack size, in the unit chosen', async () => {
    const { props } = setup()
    await choose(/Ingredient/, /^passata/)
    await userEvent.click(chip('Other'))
    await userEvent.type(within(dialog()).getByRole('spinbutton', { name: 'Other pack size' }), '1,5')
    await choose('Unit', /^kg/)
    await userEvent.click(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1))
    expect(props.onSave.mock.calls[0]?.[0]).toMatchObject({ packSize: '1,5', packUnit: 'kg', productName: 'Passata 1500 g' })
  })

  it('a chip is the pack size in the form: 1 kg is "1" kg, 500 ml is "500" ml', async () => {
    const { props } = setup()
    await choose(/Ingredient/, /^passata/)
    await userEvent.click(chip('1 kg'))
    await userEvent.click(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1))
    expect(props.onSave.mock.calls[0]?.[0]).toMatchObject({ packSize: '1', packUnit: 'kg' })
  })

  it('a chip picked for one Ingredient does not carry over to another', async () => {
    setup()
    await choose(/Ingredient/, /^passata/)
    await userEvent.click(chip('500 g'))
    await choose(/Ingredient/, /^milk/)
    for (const b of within(packGroup()).getAllByRole('button')) expect(b).toHaveAttribute('aria-pressed', 'false')
  })

  it('a weighed code has no pack size at all', async () => {
    setup({ mode: 'weighed' })
    await choose(/Ingredient/, /^passata/)
    expect(within(dialog()).queryByRole('group', { name: 'Pack size' })).toBeNull()
  })

  it('the chips only show once an Ingredient is chosen', () => {
    setup()
    expect(within(dialog()).queryByRole('group', { name: 'Pack size' })).toBeNull()
  })
})
