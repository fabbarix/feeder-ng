// Supplies in the Pantry (household-items.md 4.2, D7; H6): the Lot sheet of a Supply has Used up, for the whole Lot or part of it,
// and no go-off wording. Used up is not waste and not a mistake, so it never says "waste".
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '../../../ui'
import { makeLot, makeSupplyLot } from '../testData'
import type { StockLot } from '../types'
import { LotSheet } from './LotSheet'

const places = [
  { id: 1, name: 'Utility cupboard', kind: 'pantry' as const, default: true },
  { id: 2, name: 'Kitchen Pantry', kind: 'pantry' as const, default: false },
]
const paper = makeSupplyLot({ id: 31, quantity: 6, purchased: '2026-11-01', storagePlaceId: 1 })

function setup(lot: StockLot = paper) {
  const onUsedUp = vi.fn()
  const onDelete = vi.fn()
  const onEdit = vi.fn()
  const onMove = vi.fn()
  render(
    <ConfirmProvider>
      <LotSheet lot={lot} places={places} today="2026-11-12" onClose={() => {}} onMove={onMove} onSeeIngredient={() => {}} onEdit={onEdit} onDelete={onDelete} onUsedUp={onUsedUp} />
    </ConfirmProvider>,
  )
  return { onUsedUp, onDelete, onEdit, onMove, dialog: screen.getByRole('dialog', { name: lot.ingredientName.charAt(0).toUpperCase() + lot.ingredientName.slice(1) }) }
}

describe('LotSheet for a Supply: the facts', () => {
  it('says the quantity, the place and when it was bought, and nothing about go-off', () => {
    const { dialog } = setup()
    const facts = dialog.querySelector('.lot-sheet__facts') as HTMLElement
    expect(facts).toHaveTextContent('6 pieces')
    expect(facts).toHaveTextContent('In Utility cupboard · Bought 1 Nov')
    expect(dialog).not.toHaveTextContent(/good until|go-off|went off|use soon|spoiled/i)
  })
  it('keeps Edit, Delete and Move to', () => {
    const { dialog } = setup()
    expect(within(dialog).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { name: 'Move to' })).toBeInTheDocument()
  })
})

describe('LotSheet for a Supply: Used up', () => {
  it('has a "Used up" section with "How much was used up" (blank = all of it) and a "Used up" button', () => {
    const { dialog } = setup()
    expect(within(dialog).getByRole('heading', { name: 'Used up' })).toBeInTheDocument()
    const amount = within(dialog).getByLabelText('How much was used up')
    expect(amount).toHaveValue('')
    expect(amount).toHaveAttribute('placeholder', '6')
    expect(within(dialog).getByText('Leave it as 6 pieces to use up all of it.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Used up' })).toBeEnabled()
  })
  it('the whole Lot: the button with the amount left blank asks for the whole Lot', async () => {
    const { dialog, onUsedUp } = setup()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Used up' }))
    expect(onUsedUp).toHaveBeenCalledWith(paper, undefined)
  })
  it('the whole quantity typed is the whole Lot', async () => {
    const { dialog, onUsedUp } = setup()
    await userEvent.type(within(dialog).getByLabelText('How much was used up'), '6')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Used up' }))
    expect(onUsedUp).toHaveBeenCalledWith(paper, undefined)
  })
  it('part of it: the amount typed is what was used', async () => {
    const { dialog, onUsedUp } = setup()
    await userEvent.type(within(dialog).getByLabelText('How much was used up'), '2')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Used up' }))
    expect(onUsedUp).toHaveBeenCalledWith(paper, 2)
  })
  it('refuses more than the Lot holds, zero and a word, in the field, and asks for nothing', async () => {
    const { dialog, onUsedUp } = setup()
    const amount = within(dialog).getByLabelText('How much was used up')
    await userEvent.type(amount, '7')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Used up' }))
    expect(await within(dialog).findByText('That is more than this Stock Lot holds')).toBeInTheDocument()
    await userEvent.clear(amount)
    await userEvent.type(amount, '0')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Used up' }))
    expect(await within(dialog).findByText('The amount must be more than zero')).toBeInTheDocument()
    await userEvent.clear(amount)
    await userEvent.type(amount, 'lots')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Used up' }))
    expect(await within(dialog).findByText('Enter a number')).toBeInTheDocument()
    expect(onUsedUp).not.toHaveBeenCalled()
  })
  it('never says "waste" and never offers Throw out or Keep', () => {
    const { dialog } = setup()
    expect(dialog).not.toHaveTextContent(/waste/i)
    expect(within(dialog).queryByRole('button', { name: /throw out|keep/i })).toBeNull()
  })
  it('does not call Delete or Edit or Move', async () => {
    const { dialog, onDelete, onEdit, onMove } = setup()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Used up' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(onEdit).not.toHaveBeenCalled()
    expect(onMove).not.toHaveBeenCalled()
  })
})

describe('LotSheet for a Supply: Delete stays "for a mistake"', () => {
  it('asks in our own dialog and points to Used up, with no word of waste or the streak', async () => {
    const { dialog, onDelete } = setup()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete this Stock Lot?' })
    expect(confirm).toHaveTextContent('Use Delete for a mistake, such as a double Scan. If the Household used it, choose Used up instead.')
    expect(confirm).not.toHaveTextContent(/waste|streak|throw out/i)
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith(paper)
  })
})

describe('LotSheet for food has no Used up', () => {
  it('no Used up section, no field, and the go-off wording stays', () => {
    const { dialog } = setup(makeLot({ id: 5, ingredientName: 'chicken thighs', kind: 'food', quantity: 800, goesOff: '2026-11-13', spoiled: false, storagePlaceId: 1 }))
    expect(within(dialog).queryByRole('button', { name: 'Used up' })).toBeNull()
    expect(within(dialog).queryByLabelText('How much was used up')).toBeNull()
    expect(dialog).toHaveTextContent('Good until tomorrow')
  })
  it('a Lot with no kind (an older answer) is food', () => {
    const { dialog } = setup(makeLot({ id: 5, ingredientName: 'rice', goesOff: null, storagePlaceId: 1 }))
    expect(within(dialog).queryByRole('button', { name: 'Used up' })).toBeNull()
  })
})
