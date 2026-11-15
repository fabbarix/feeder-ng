// B9-29 (SAFE-11, mock safe-11-lot-sheet-390-light.html): the Lot sheet leads with the Lot, not with a form most people never use.
//   - Edit, "Move…" (secondary, aria-expanded) and Delete are the actions; the "Move to" form is not in the DOM until "Move…" is pressed
//   - the form's "Move" is never disabled: pressing it with no place says "Choose where to move it." at the Storage Place field
//   - a Lot with nowhere to move to (no other Storage Place) shows no "Move…" and no form
//   - "All <Ingredient>" (the Ingredient's own sheet) is reachable without opening Move…
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '../../../ui'
import { makeLot } from '../testData'
import { LotSheet } from './LotSheet'

const places = [
  { id: 1, name: 'Kitchen Pantry', kind: 'pantry' as const, default: true },
  { id: 3, name: 'Kitchen Fridge', kind: 'fridge' as const, default: false },
]
const lot = makeLot({ id: 11, ingredientName: 'chicken thighs', quantity: 800, goesOff: '2026-11-13', spoiled: false, storagePlaceId: 1 })

function setup(over: { places?: typeof places } = {}) {
  const onMove = vi.fn()
  const onSeeIngredient = vi.fn()
  render(
    <ConfirmProvider>
      <LotSheet lot={lot} places={over.places ?? places} today="2026-11-12" onClose={() => {}} onMove={onMove} onSeeIngredient={onSeeIngredient} onEdit={() => {}} onDelete={() => {}} />
    </ConfirmProvider>,
  )
  return { onMove, onSeeIngredient, dialog: screen.getByRole('dialog', { name: 'Chicken thighs' }) }
}

describe('LotSheet: Move is revealed, not always shown', () => {
  it('shows Edit, Move… and Delete, with Move… collapsed and no form', () => {
    const { dialog } = setup()
    expect(within(dialog).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Move…' })).toHaveAttribute('aria-expanded', 'false')
    expect(within(dialog).queryByRole('heading', { name: 'Move to' })).toBeNull()
    expect(within(dialog).queryByRole('combobox')).toBeNull()
    expect(within(dialog).queryByRole('textbox')).toBeNull()
  })
  it('pressing Move… reveals the form, and pressing it again hides it', async () => {
    const { dialog } = setup()
    const open = within(dialog).getByRole('button', { name: 'Move…' })
    await userEvent.click(open)
    expect(open).toHaveAttribute('aria-expanded', 'true')
    expect(within(dialog).getByRole('heading', { name: 'Move to' })).toBeInTheDocument()
    expect(within(dialog).getByRole('combobox', { name: 'Storage Place' })).toBeInTheDocument()
    await userEvent.click(open)
    expect(open).toHaveAttribute('aria-expanded', 'false')
    expect(within(dialog).queryByRole('heading', { name: 'Move to' })).toBeNull()
  })
  it('Move is never disabled; with no place chosen it says what to do and moves nothing', async () => {
    const { dialog, onMove } = setup()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move…' }))
    const move = within(dialog).getByRole('button', { name: 'Move' })
    expect(move).toBeEnabled()
    await userEvent.click(move)
    expect(within(dialog).getByText('Choose where to move it.')).toBeInTheDocument()
    expect(within(dialog).getByRole('combobox', { name: 'Storage Place' })).toHaveAttribute('aria-invalid', 'true')
    expect(onMove).not.toHaveBeenCalled()
  })
  it('a Lot with no other Storage Place to go to shows no Move…', () => {
    const { dialog } = setup({ places: [places[0]!] })
    expect(within(dialog).queryByRole('button', { name: 'Move…' })).toBeNull()
    expect(within(dialog).queryByRole('heading', { name: 'Move to' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })
  it('the Ingredient\'s own sheet is reachable without opening Move…', async () => {
    const { dialog, onSeeIngredient } = setup()
    await userEvent.click(within(dialog).getByRole('button', { name: 'All chicken thighs' }))
    expect(onSeeIngredient).toHaveBeenCalledWith(7)
  })
})
