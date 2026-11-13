// BR-E (design §3.6, §11.3 answer 4): the convert dialog: what goes when a plannable Recipe becomes a Base recipe, and its Yield. RED until the component exists.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { convertConfirm } from '../../../lib/baseRecipes/convertConfirm'
import type { ConvertState } from '../hooks/useBaseRecipeLines'
import { ConvertBaseDialog } from './ConvertBaseDialog'

const confirm = convertConfirm('Pesto', {
  plannedMeals: [{ date: '2026-11-10', mealSlotName: 'Dinner', courseName: 'Main', pinned: true, bought: false }],
  slotRules: [],
  leftovers: 0,
  preferences: 0,
})
const state = (over: Partial<ConvertState> = {}): ConvertState => ({
  path: '$.recipes[0].ingredients[1]', recipe: { id: 7, name: 'Pesto' }, status: 'ready', confirm, yield: 500, yieldUnit: 'ml', ...over,
})
const show = (s: ConvertState | null, canConfirm = true) => {
  const on = { onYield: vi.fn(), onYieldUnit: vi.fn(), onConfirm: vi.fn(), onCancel: vi.fn() }
  render(<ConvertBaseDialog state={s} canConfirm={canConfirm} {...on} />)
  return on
}

describe('ConvertBaseDialog', () => {
  it('renders nothing when closed', () => {
    show(null)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is a dialog titled "Turn Pesto into a Base recipe?" listing what is removed', () => {
    show(state())
    const dialog = screen.getByRole('dialog', { name: 'Turn Pesto into a Base recipe?' })
    expect(within(dialog).getByText(/These Planned Meals from today on are removed: Tue 10 Nov Dinner \(Main, Pinned\)\./)).toBeInTheDocument()
    expect(within(dialog).getByText('Cooked history stays.')).toBeInTheDocument()
  })

  it('has the Yield (amount and unit) prefilled from the line', () => {
    show(state())
    expect(screen.getByRole('spinbutton', { name: 'Yield' })).toHaveDisplayValue('500')
    expect(screen.getByRole('combobox', { name: 'Yield unit' })).toHaveTextContent('ml')
  })

  it('Turn into a Base recipe confirms; Cancel and Escape cancel', async () => {
    const on = show(state())
    await userEvent.click(screen.getByRole('button', { name: 'Turn into a Base recipe' }))
    expect(on.onConfirm).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(on.onCancel).toHaveBeenCalledOnce()
    await userEvent.keyboard('{Escape}')
    expect(on.onCancel).toHaveBeenCalledTimes(2)
  })

  it('reports a typed Yield', async () => {
    const on = show(state())
    const amount = screen.getByRole('spinbutton', { name: 'Yield' })
    await userEvent.clear(amount)
    await userEvent.type(amount, '250{Enter}')
    expect(on.onYield).toHaveBeenLastCalledWith(250)
  })

  it('reports a chosen unit', async () => {
    const on = show(state())
    await userEvent.click(screen.getByRole('combobox', { name: 'Yield unit' }))
    await userEvent.click(await screen.findByRole('option', { name: 'g' }))
    expect(on.onYieldUnit).toHaveBeenCalledWith('g')
  })

  it('turns the primary action off when the Yield is not valid', () => {
    show(state(), false)
    expect(screen.getByRole('button', { name: 'Turn into a Base recipe' })).toBeDisabled()
  })

  it('shows a loading note and no primary action while the dry run is asked', () => {
    show(state({ status: 'loading', confirm: undefined }))
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Turn Pesto into a Base recipe?')
    expect(screen.getByRole('status')).toHaveTextContent('Checking what changes')
    expect(screen.queryByRole('button', { name: 'Turn into a Base recipe' })).toBeNull()
  })

  it('announces a failed dry run as an alert, with only Cancel left', () => {
    show(state({ status: 'error', confirm: undefined, error: 'A Ready Meal cannot be a Base recipe.' }), false)
    expect(screen.getByRole('alert')).toHaveTextContent('A Ready Meal cannot be a Base recipe.')
    expect(screen.queryByRole('button', { name: 'Turn into a Base recipe' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })
})
