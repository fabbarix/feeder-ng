// SR5 (13.5 step 6, spec "Add builds the Op"): Add hands the valid form over (kind included), never asks for a Price, and names the new row.
import { waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { toUnknownOp } from '../lib/unknownForm'
import { addButton, choose, dialog, lines, packGroup, setup } from './newProduct.test-helper'

const meta = { clientUuid: 'ignored', scannedAt: '2026-11-13T10:00:00Z', shopId: 3 }
const chip = (name: string) => within(packGroup()).getByRole('button', { name })

describe('NewProductSheet: Add', () => {
  it('saves an existing Ingredient: its id, Base Unit and the pack size', async () => {
    const { props } = setup()
    await choose(/Ingredient/, /^milk/)
    await userEvent.click(chip('1 l'))
    await userEvent.click(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1))
    expect(props.onSave.mock.calls[0]?.[0]).toMatchObject({
      ingredient: { id: 2, name: 'milk', baseUnit: 'ml' },
      packSize: '1',
      packUnit: 'l',
      productName: 'Milk 1000 ml',
      scope: 'global',
    })
  })

  it('a picked Line saves its Ingredient', async () => {
    const { props } = setup({ lines })
    await userEvent.click(within(dialog()).getByRole('button', { name: /^Eggs/ }))
    await userEvent.click(chip('6 pieces'))
    await userEvent.click(addButton('Add · ticks Eggs'))
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1))
    expect(props.onSave.mock.calls[0]?.[0]).toMatchObject({ ingredient: { id: 14, name: 'Eggs', baseUnit: 'piece' }, packSize: '6', packUnit: 'piece', productName: 'Eggs 6 pieces' })
  })

  it('a new Supply is saved with kind supply, no id and its Base Unit; the Op carries kind', async () => {
    const { props } = setup()
    await userEvent.click(within(dialog()).getByRole('radio', { name: 'Supply' }))
    await choose(/Supply/, /New Supply .toilet paper./, 'toilet paper')
    await userEvent.click(chip('4 pieces'))
    await userEvent.click(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1))
    const values = props.onSave.mock.calls[0]?.[0]
    expect(values.ingredient).toMatchObject({ name: 'toilet paper', baseUnit: 'piece', kind: 'supply' })
    expect(values.ingredient).not.toHaveProperty('id')
    expect(toUnknownOp(values, { mode: 'pack', code: '8001234567890' }, meta).ingredient).toEqual({ name: 'toilet paper', baseUnit: 'piece', kind: 'supply' })
  })

  it('a new Ingredient is saved with kind food', async () => {
    const { props } = setup()
    await choose(/Ingredient/, /New Ingredient .olive oil./, 'olive oil')
    await userEvent.click(chip('1 kg'))
    await userEvent.click(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1))
    expect(props.onSave.mock.calls[0]?.[0].ingredient).toMatchObject({ name: 'olive oil', baseUnit: 'g', kind: 'food' })
  })

  it('an existing Supply is saved by id', async () => {
    const { props } = setup()
    await userEvent.click(within(dialog()).getByRole('radio', { name: 'Supply' }))
    await choose(/Supply/, /^Dish soap/)
    await userEvent.click(chip('500 ml'))
    await userEvent.click(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1))
    expect(props.onSave.mock.calls[0]?.[0].ingredient).toMatchObject({ id: 15, baseUnit: 'ml', kind: 'supply' })
  })

  it('a price-valued weighed code asks for the weight once and sends it', async () => {
    const { props } = setup({ mode: 'weighed_price', priceText: '€2.50' })
    await choose(/Ingredient/, /^milk/)
    expect(within(dialog()).getByText(/The label says €2\.50/)).toBeInTheDocument()
    await userEvent.type(within(dialog()).getByRole('spinbutton', { name: 'Weight (g)' }), '450')
    await userEvent.click(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1))
    expect(props.onSave.mock.calls[0]?.[0]).toMatchObject({ weightText: '450' })
  })

  it('a price-valued weighed code without a weight is refused with a hint', async () => {
    const { props } = setup({ mode: 'weighed_price', priceText: '€2.50' })
    await choose(/Ingredient/, /^milk/)
    await userEvent.click(addButton())
    expect(props.onSave).not.toHaveBeenCalled()
    expect(within(dialog()).getByRole('spinbutton', { name: 'Weight (g)' })).toHaveAccessibleDescription(/Enter a number above 0/)
  })

  it('never asks for a Price', async () => {
    setup({ lines })
    expect(within(dialog()).queryByText(/Price/i)).toBeNull()
    await userEvent.click(within(dialog()).getByRole('button', { name: /^Eggs/ }))
    expect(within(dialog()).queryByRole('textbox', { name: /price/i })).toBeNull()
    expect(within(dialog()).queryByRole('spinbutton', { name: /price/i })).toBeNull()
  })

  it('tells the caller about the new row once onSave has settled, with the clientUuid it put in the form', async () => {
    let settle: () => void = () => {}
    const onSave = vi.fn((_values: unknown) => new Promise<void>((r) => (settle = r)))
    const { props } = setup({ onSave })
    await choose(/Ingredient/, /^milk/)
    await userEvent.click(chip('1 l'))
    await userEvent.click(addButton())
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ clientUuid: 'uuid-new-1' })
    expect(props.onAdded).not.toHaveBeenCalled()
    settle()
    await waitFor(() => expect(props.onAdded).toHaveBeenCalledWith('new:uuid-new-1', 'uuid-new-1'))
    expect(props.onAdded).toHaveBeenCalledTimes(1)
  })

  it('works with a synchronous onSave and without onAdded', async () => {
    const { props } = setup({ onAdded: undefined })
    await choose(/Ingredient/, /^milk/)
    await userEvent.click(chip('1 l'))
    await userEvent.click(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1))
  })

  it('does not call onAdded when the form is refused', async () => {
    const { props } = setup()
    await userEvent.click(addButton())
    expect(props.onSave).not.toHaveBeenCalled()
    expect(props.onAdded).not.toHaveBeenCalled()
  })

  it('does not call onAdded when onSave fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('boom'))
    const { props } = setup({ onSave })
    await choose(/Ingredient/, /^milk/)
    await userEvent.click(chip('1 l'))
    await userEvent.click(addButton())
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(props.onAdded).not.toHaveBeenCalled()
  })

  it('a double tap on Add saves once', async () => {
    const { props } = setup()
    await choose(/Ingredient/, /^milk/)
    await userEvent.click(chip('1 l'))
    await userEvent.dblClick(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalled())
    expect(props.onSave).toHaveBeenCalledTimes(1)
  })

  it('Add is the sheet\'s one primary Button, in FormActions', async () => {
    setup()
    const primaries = dialog().querySelectorAll('button[data-variant="primary"]')
    expect(primaries).toHaveLength(1)
    expect(addButton().closest('.form-actions__primary')).not.toBeNull()
  })

  it('closing the sheet calls onClose and nothing is saved', async () => {
    const { props } = setup()
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Close' }))
    expect(props.onClose).toHaveBeenCalled()
    expect(props.onSave).not.toHaveBeenCalled()
  })
})
