// Supplies in the Pantry (household-items.md 4.1, 4.2; H6): Add to Stock lists both kinds under "Ingredients" and "Supplies", and a
// Supply has no Good until and no Shelf Life: nothing about go-off shows for it and none is sent.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IngredientChoice } from '../types'
import { AddLotSheet } from './AddLotSheet'

const choices: IngredientChoice[] = [
  { id: 7, name: 'chicken thighs', baseUnit: 'g', kind: 'food', restockLevel: null, group: 'Ingredients' },
  { id: 8, name: 'eggs', baseUnit: 'piece', kind: 'food', restockLevel: null, group: 'Ingredients' },
  { id: 41, name: 'dish soap', baseUnit: 'ml', kind: 'supply', restockLevel: null, group: 'Supplies' },
  { id: 40, name: 'toilet paper', baseUnit: 'piece', kind: 'supply', restockLevel: 6, group: 'Supplies' },
]

function setup(list: IngredientChoice[] = choices) {
  const onSubmit = vi.fn()
  render(<AddLotSheet open onClose={() => {}} choices={list} onSubmit={onSubmit} />)
  return { onSubmit, sheet: screen.getByRole('dialog', { name: 'Add a Stock Lot' }) }
}
async function pick(name: RegExp) {
  await userEvent.click(screen.getByRole('combobox', { name: 'Ingredient' }))
  await userEvent.click(await screen.findByRole('option', { name }))
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-11-10T12:00:00'))
})
afterEach(() => vi.useRealTimers())

describe('AddLotSheet with Supplies', () => {
  it('lists both kinds under the subheaders "Ingredients" and "Supplies"', async () => {
    setup()
    await userEvent.click(screen.getByRole('combobox', { name: 'Ingredient' }))
    const listbox = await screen.findByRole('listbox')
    const groups = within(listbox).getAllByRole('group')
    expect(groups.map((g) => g.querySelector('.select__group-title')?.textContent)).toEqual(['Ingredients', 'Supplies'])
    expect(within(groups[0]!).getAllByRole('option').map((o) => o.textContent)).toEqual([expect.stringContaining('chicken thighs'), expect.stringContaining('eggs')])
    expect(within(groups[1]!).getAllByRole('option').map((o) => o.textContent)).toEqual([expect.stringContaining('dish soap'), expect.stringContaining('toilet paper')])
  })
  it('a food-only list has no subheaders', async () => {
    setup(choices.slice(0, 2).map(({ group: _group, ...c }) => c))
    await userEvent.click(screen.getByRole('combobox', { name: 'Ingredient' }))
    const listbox = await screen.findByRole('listbox')
    expect(within(listbox).queryAllByRole('group')).toHaveLength(0)
  })
  it('picking a Supply keeps Quantity in its Base Unit and shows no Good until and no Shelf Life', async () => {
    const { sheet } = setup()
    await pick(/toilet paper/)
    expect(within(sheet).getByText('piece', { selector: '.ui-field__suffix' })).toBeInTheDocument()
    expect(within(sheet).queryByText(/good until/i)).toBeNull()
    expect(within(sheet).queryByText(/shelf life/i)).toBeNull()
    expect(within(sheet).queryByText(/go-off/i)).toBeNull()
    expect(within(sheet).queryByRole('switch')).toBeNull()
  })
  it('submits a Supply with its Ingredient id and quantity only: no goesOff', async () => {
    const { onSubmit } = setup()
    await pick(/toilet paper/)
    await userEvent.type(screen.getByLabelText('Quantity'), '9')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({ ingredientId: 40, quantity: 9 })
    expect(onSubmit.mock.calls[0]![0]).not.toHaveProperty('goesOff')
  })
  it('a Supply measured in ml takes its Base Unit as the suffix', async () => {
    const { sheet } = setup()
    await pick(/dish soap/)
    expect(within(sheet).getByText('ml', { selector: '.ui-field__suffix' })).toBeInTheDocument()
  })
})
