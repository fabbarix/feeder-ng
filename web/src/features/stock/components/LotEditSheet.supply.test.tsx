// Supplies in the Pantry (household-items.md 4.2; H6): the Edit sheet of a Supply's Lot has no Good until and no "No go-off date".
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeSupplyLot } from '../testData'
import { LotEditSheet } from './LotEditSheet'

const lot = makeSupplyLot({ id: 31, quantity: 4, purchased: '2026-11-01' })

function setup() {
  const onSubmit = vi.fn()
  const onClose = vi.fn()
  render(<LotEditSheet lot={lot} today="2026-11-12" onClose={onClose} onSubmit={onSubmit} />)
  return { onSubmit, onClose, dialog: screen.getByRole('dialog', { name: 'Edit Toilet paper' }) }
}

describe('LotEditSheet for a Supply', () => {
  it('has Quantity (suffix its Base Unit) and Bought on, and nothing about go-off', () => {
    const { dialog } = setup()
    expect(within(dialog).getByLabelText('Quantity')).toHaveValue('4')
    expect(within(dialog).getByText('piece', { selector: '.ui-field__suffix' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Bought on/ })).toHaveTextContent('1 Nov 2026')
    expect(within(dialog).queryByRole('button', { name: /Good until/ })).toBeNull()
    expect(within(dialog).queryByText('Good until')).toBeNull()
    expect(within(dialog).queryByRole('switch')).toBeNull()
    expect(dialog).not.toHaveTextContent(/go-off/i)
  })
  it('saving a new quantity sends the quantity alone, never a goesOff', async () => {
    const { onSubmit, dialog } = setup()
    const quantity = within(dialog).getByLabelText('Quantity')
    await userEvent.clear(quantity)
    await userEvent.type(quantity, '3')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith(lot, { quantity: 3 })
    expect(onSubmit.mock.calls[0]![1]).not.toHaveProperty('goesOff')
  })
  it('saving with no change just closes', async () => {
    const { onSubmit, onClose, dialog } = setup()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
