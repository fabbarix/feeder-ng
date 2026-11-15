// b8-polish (user decision, replaces the b8-pantry review): until a new Storage Place is chosen, the "Move to" Storage Place field
// of the Lot sheet shows the hint "Choose a Storage Place", whatever place the Lot is in now (the Lot's place is already on the sheet).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ConfirmProvider } from '../../../ui'
import { makeSupplyLot } from '../testData'
import { LotSheet } from './LotSheet'

const places = [
  { id: 1, name: 'Utility cupboard', kind: 'pantry' as const, default: true },
  { id: 2, name: 'Kitchen Pantry', kind: 'pantry' as const, default: false },
]

// B9-29 (SAFE-11): the Move form shows after "Move…" is pressed.
async function field(storagePlaceId: number | null) {
  const lot = makeSupplyLot({ id: 31, quantity: 4, baseUnit: 'piece', storagePlaceId })
  render(
    <ConfirmProvider>
      <LotSheet lot={lot} places={places} today="2026-11-12" onClose={() => {}} onMove={() => {}} onSeeIngredient={() => {}} onEdit={() => {}} onDelete={() => {}} onUsedUp={() => {}} />
    </ConfirmProvider>,
  )
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Move…' }))
  return within(screen.getByRole('dialog')).getByRole('combobox', { name: 'Storage Place' })
}

describe('LotSheet: the Storage Place field before a choice', () => {
  it('shows the hint "Choose a Storage Place" for a Lot in no Storage Place', async () => {
    const trigger = await field(null)
    expect(trigger).toHaveTextContent('Choose a Storage Place')
    expect(trigger).not.toHaveTextContent('Not sorted')
    expect(trigger).toHaveAttribute('data-placeholder')
  })
  it('shows the same hint for a Lot that is in a Storage Place, not that place', async () => {
    const trigger = await field(1)
    expect(trigger).toHaveTextContent('Choose a Storage Place')
    expect(trigger).not.toHaveTextContent('Utility cupboard')
    expect(trigger).toHaveAttribute('data-placeholder')
  })
})
