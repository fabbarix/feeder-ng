// Beta.5 ST: the Edit sheet of a Stock Lot: Quantity, Bought on, Good until (reconcile Q22).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeLot } from '../testData'
import type { StockLot } from '../types'
import { LotEditSheet } from './LotEditSheet'

const today = '2026-11-12'
const lot = makeLot({ id: 5, ingredientName: 'chicken thighs', quantity: 800, purchased: '2026-11-09', goesOff: '2026-11-13', spoiled: false, shelfLifeDays: 4 })

function setup(l: StockLot | null = lot) {
  const onSubmit = vi.fn()
  const onClose = vi.fn()
  render(<LotEditSheet lot={l} today={today} onClose={onClose} onSubmit={onSubmit} />)
  return { onSubmit, onClose }
}

const save = () => screen.getByRole('button', { name: 'Save' })

describe('LotEditSheet', () => {
  it('is closed without a Lot', () => {
    setup(null)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is titled for the Ingredient with the Lot\'s values in our own fields, the Base Unit as suffix', () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: 'Edit Chicken thighs' })
    expect(within(dialog).getByLabelText('Quantity')).toHaveValue('800')
    expect(within(dialog).getByText('g', { selector: '.ui-field__suffix' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Bought on/ })).toHaveTextContent('9 Nov 2026')
    expect(within(dialog).getByRole('button', { name: /Good until/ })).toHaveTextContent('13 Nov 2026')
    expect(dialog.querySelector('select, input[type="number"], input[type="date"]')).toBeNull()
  })

  it('has no Storage Place field: that changes with Move to', () => {
    setup()
    expect(screen.queryByText('Storage Place')).toBeNull()
  })

  it('offers "No go-off date" only when the Ingredient has no Shelf Life where the Lot is', () => {
    setup()
    expect(screen.queryByRole('switch', { name: 'No go-off date' })).toBeNull()
  })

  it('for a Lot without a Shelf Life the switch is on and Good until is empty', () => {
    setup(makeLot({ id: 6, quantity: 1000, purchased: '2026-11-09', goesOff: null, spoiled: false, shelfLifeDays: null }))
    expect(screen.getByRole('switch', { name: 'No go-off date' })).toBeChecked()
  })

  it('closing without a change does not call onSubmit', async () => {
    const { onSubmit, onClose } = setup()
    await userEvent.click(save())
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('submits only the quantity that changed', async () => {
    const { onSubmit } = setup()
    const input = screen.getByLabelText('Quantity')
    await userEvent.clear(input)
    await userEvent.type(input, '650')
    await userEvent.click(save())
    expect(onSubmit).toHaveBeenCalledWith(lot, { quantity: 650 })
  })

  it('shows an error and does not submit a quantity of zero', async () => {
    const { onSubmit } = setup()
    const input = screen.getByLabelText('Quantity')
    await userEvent.clear(input)
    await userEvent.type(input, '0')
    await userEvent.click(save())
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('The amount must be more than zero')).toBeInTheDocument()
  })

  it('changing Bought on suggests Good until again from the Shelf Life, and submits only Bought on', async () => {
    const { onSubmit } = setup()
    await userEvent.click(screen.getByRole('button', { name: /Bought on/ }))
    await userEvent.click(screen.getByRole('button', { name: '10 November 2026' }))
    expect(screen.getByRole('button', { name: /Good until/ })).toHaveTextContent('14 Nov 2026')
    await userEvent.click(save())
    expect(onSubmit).toHaveBeenCalledWith(lot, { purchased: '2026-11-10' })
  })

  it('a Good until chosen by hand is sent and survives a later change of Bought on', async () => {
    const { onSubmit } = setup()
    await userEvent.click(screen.getByRole('button', { name: /Good until/ }))
    await userEvent.click(screen.getByRole('button', { name: '20 November 2026' }))
    await userEvent.click(screen.getByRole('button', { name: /Bought on/ }))
    await userEvent.click(screen.getByRole('button', { name: '10 November 2026' }))
    expect(screen.getByRole('button', { name: /Good until/ })).toHaveTextContent('20 Nov 2026')
    await userEvent.click(save())
    expect(onSubmit).toHaveBeenCalledWith(lot, { purchased: '2026-11-10', goesOff: '2026-11-20' })
  })

  it('cannot pick Bought on after today', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /Bought on/ }))
    const day = screen.getByRole('button', { name: '13 November 2026' })
    // aria-disabled, not the native attribute: a native disabled button drops out of the calendar's keyboard focus
    expect(day).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(day)
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: /Bought on/ })).toHaveTextContent('9 Nov 2026')
  })

  it('Cancel closes the sheet without saving, even after a change', async () => {
    const { onSubmit, onClose } = setup()
    const input = screen.getByLabelText('Quantity')
    await userEvent.clear(input)
    await userEvent.type(input, '650')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('"No go-off date" sends goesOff null', async () => {
    const { onSubmit } = setup(makeLot({ id: 6, quantity: 1000, purchased: '2026-11-09', goesOff: '2026-11-20', spoiled: false, shelfLifeDays: null }))
    await userEvent.click(screen.getByRole('switch', { name: 'No go-off date' }))
    await userEvent.click(save())
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ id: 6 }), { goesOff: null })
  })
})
