// Beta.5 ST: Edit and Delete in the Lot sheet; Delete asks in our own dialog (reconcile Q21, Q22a).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '../../../ui'
import { makeLot } from '../testData'
import type { StockLot } from '../types'
import { LotSheet } from './LotSheet'

const places = [{ id: 1, name: 'Kitchen Pantry', kind: 'pantry' as const, default: true }]
const fine = makeLot({ id: 5, quantity: 800, purchased: '2026-11-09', goesOff: '2026-11-13', spoiled: false, storagePlaceId: 1 })
const wentOff = makeLot({ id: 6, quantity: 300, purchased: '2026-11-01', goesOff: '2026-11-05', spoiled: true, storagePlaceId: 1 })

function setup(lot: StockLot) {
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  const onClose = vi.fn()
  render(
    <ConfirmProvider>
      <LotSheet lot={lot} places={places} today="2026-11-12" onClose={onClose} onMove={() => {}} onSeeIngredient={() => {}} onEdit={onEdit} onDelete={onDelete} />
    </ConfirmProvider>,
  )
  return { onEdit, onDelete, onClose }
}

afterEach(() => vi.restoreAllMocks())

describe('LotSheet: Edit and Delete', () => {
  it('Edit asks the screen to open the edit sheet for this Lot', async () => {
    const { onEdit } = setup(fine)
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledWith(fine)
  })

  it('Delete asks first, in a dialog of our own, and says it is not waste', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const { onDelete } = setup(fine)
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete this Stock Lot?' })
    expect(dialog).toHaveTextContent('Use Delete for a mistake, such as a double Scan. It does not count as waste. To record waste, Throw out a Lot that has gone off.')
    expect(dialog).not.toHaveTextContent('Zero-waste streak')
    expect(onDelete).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('confirming Delete calls onDelete with the Lot', async () => {
    const { onDelete } = setup(fine)
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete this Stock Lot?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith(fine)
  })

  it('cancelling Delete calls nothing', async () => {
    const { onDelete } = setup(fine)
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete this Stock Lot?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('for a Lot that has gone off the confirm says its go-off goes with it', async () => {
    setup(wentOff)
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete this Stock Lot?' })
    expect(dialog).toHaveTextContent('deleting it also takes that go-off off your Zero-waste streak')
  })

  it('keeps Move to', () => {
    setup(fine)
    expect(screen.getByRole('heading', { name: 'Move to' })).toBeInTheDocument()
  })
})
