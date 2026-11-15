// B9-29 (SSP-17, mock ssp-17-keep-date.html): "Flour: good until?", the sheet Change opens from the Keep toast.
//   <KeepDateSheet open lot today onClose onKeep />      lot: { id, ingredientName }; onKeep(date): Promise<unknown> | void
// Pinned: a dialog named "<Ingredient>: good until?" (capitalised); the line "Keep means it did not go off. It leaves Throw out or keep?
// until then."; a radiogroup of Today, Tomorrow, In 3 days and In a week, each with its date ("Tue 10 Nov"), Today chosen at first;
// "Pick a date" reveals our DateField labelled "Good until" (min today); the picked day is the choice; the primary "Keep until <Thu 12 Nov>" follows
// the choice and calls onKeep with the ISO date; the round Close is there (no Cancel); nothing native.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeLot } from '../testData'
import { KeepDateSheet } from './KeepDateSheet'

function setup() {
  const onKeep = vi.fn().mockResolvedValue(undefined)
  const onClose = vi.fn()
  render(<KeepDateSheet open lot={makeLot({ id: 3, ingredientName: 'flour' })} today="2026-11-09" onClose={onClose} onKeep={onKeep} />)
  return { onKeep, onClose }
}
const sheet = () => screen.getByRole('dialog', { name: 'Flour: good until?' })

describe('KeepDateSheet', () => {
  it('is named for the Ingredient and explains what Keep means', () => {
    setup()
    expect(within(sheet()).getByText('Keep means it did not go off. It leaves Throw out or keep? until then.')).toBeInTheDocument()
  })
  it('offers Today, Tomorrow, In 3 days and In a week as a radiogroup, each with its date, Today chosen', () => {
    setup()
    const group = within(sheet()).getByRole('radiogroup')
    const radios = within(group).getAllByRole('radio')
    expect(radios.map((r) => r.getAttribute('aria-label') ?? r.textContent)).toEqual([
      expect.stringMatching(/Today.*Mon 9 Nov/),
      expect.stringMatching(/Tomorrow.*Tue 10 Nov/),
      expect.stringMatching(/In 3 days.*Thu 12 Nov/),
      expect.stringMatching(/In a week.*Mon 16 Nov/),
    ])
    expect(radios[0]).toBeChecked()
    expect(within(sheet()).getByRole('button', { name: 'Keep until Mon 9 Nov' })).toBeInTheDocument()
  })
  it('choosing In 3 days changes the primary and Keep sends that date', async () => {
    const { onKeep } = setup()
    await userEvent.click(within(sheet()).getByRole('radio', { name: /In 3 days/ }))
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Keep until Thu 12 Nov' }))
    expect(onKeep).toHaveBeenCalledWith('2026-11-12')
  })
  it('"Pick a date" reveals our date picker (a field named "Good until"), which cannot pick a day before today, and the picked day is the choice', async () => {
    const { onKeep } = setup()
    await userEvent.click(within(sheet()).getByRole('radio', { name: /Pick a date/ }))
    await userEvent.click(within(sheet()).getByRole('button', { name: /Good until/ }))
    const grid = await screen.findByRole('grid')
    expect(within(grid).getByRole('button', { name: '8 November 2026' })).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(within(grid).getByRole('button', { name: '20 November 2026' }))
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Keep until Fri 20 Nov' }))
    expect(onKeep).toHaveBeenCalledWith('2026-11-20')
  })
  it('has the round Close and no Cancel, and no native control', () => {
    setup()
    expect(within(sheet()).getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(within(sheet()).queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(sheet().querySelector('select, option, input[type="date"]')).toBeNull()
  })
})
