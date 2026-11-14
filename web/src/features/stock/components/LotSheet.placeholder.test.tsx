// b8-pantry review: until a new Storage Place is chosen, the Storage Place field of the Lot sheet shows where the Lot is now,
// "Not sorted" for a Lot in no Storage Place (GLOSSARY: Storage Place), instead of an empty value.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConfirmProvider } from '../../../ui'
import { makeSupplyLot } from '../testData'
import { LotSheet } from './LotSheet'

const places = [
  { id: 1, name: 'Utility cupboard', kind: 'pantry' as const, default: true },
  { id: 2, name: 'Kitchen Pantry', kind: 'pantry' as const, default: false },
]

function field(storagePlaceId: number | null) {
  const lot = makeSupplyLot({ id: 31, quantity: 4, baseUnit: 'piece', storagePlaceId })
  render(
    <ConfirmProvider>
      <LotSheet lot={lot} places={places} today="2026-11-12" onClose={() => {}} onMove={() => {}} onSeeIngredient={() => {}} onEdit={() => {}} onDelete={() => {}} onUsedUp={() => {}} />
    </ConfirmProvider>,
  )
  return within(screen.getByRole('dialog')).getByRole('combobox', { name: 'Storage Place' })
}

describe('LotSheet: the Storage Place field before a choice', () => {
  it('shows "Not sorted" for a Lot in no Storage Place', () => {
    const trigger = field(null)
    expect(trigger).toHaveTextContent('Not sorted')
    expect(trigger).toHaveAttribute('data-placeholder')
  })
  it('shows the Storage Place the Lot is in now', () => {
    expect(field(1)).toHaveTextContent('Utility cupboard')
  })
})
