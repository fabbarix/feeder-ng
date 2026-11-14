// b8-pantry G4: the Used up field of a Supply's Lot sheet shows the Base Unit as a suffix, like "How much to move" below it.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConfirmProvider } from '../../../ui'
import { makeSupplyLot } from '../testData'
import { LotSheet } from './LotSheet'

describe('LotSheet for a Supply: units', () => {
  it('shows the Base Unit after both quantity fields', () => {
    const lot = makeSupplyLot({ id: 31, quantity: 4, baseUnit: 'piece', storagePlaceId: 1 })
    render(
      <ConfirmProvider>
        <LotSheet lot={lot} places={[{ id: 1, name: 'Utility cupboard', kind: 'pantry', default: true }, { id: 2, name: 'Kitchen Pantry', kind: 'pantry', default: false }]} today="2026-11-12" onClose={() => {}} onMove={() => {}} onSeeIngredient={() => {}} onEdit={() => {}} onDelete={() => {}} onUsedUp={() => {}} />
      </ConfirmProvider>,
    )
    const dialog = screen.getByRole('dialog')
    for (const label of ['How much to move', 'How much was used up']) {
      const field = within(dialog).getByLabelText(label)
      expect(field.closest('.ui-field')?.querySelector('.ui-field__suffix')).toHaveTextContent('piece')
    }
  })
})
