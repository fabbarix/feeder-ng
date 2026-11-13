// BR-E round 2: the one shared Yield field (amount and unit) used by the Import Review's FileYieldForm and ConvertBaseDialog and by
// features/recipes RecipeDetailsFields. Props pinned here: amount, unit, onAmountChange, onUnitChange, amountLabel?, unitLabel?, amountError?,
// unitError?, units?, size?. RED until ui/fields/YieldField.tsx exists.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { YieldField } from './YieldField'

const show = (over: Partial<Parameters<typeof YieldField>[0]> = {}) => {
  const on = { onAmountChange: vi.fn(), onUnitChange: vi.fn() }
  render(<YieldField amount={500} unit="ml" {...on} {...over} />)
  return on
}

describe('YieldField', () => {
  it('shows the amount and the unit under the labels Yield and Yield unit', () => {
    show()
    expect(screen.getByRole('spinbutton', { name: 'Yield' })).toHaveDisplayValue('500')
    expect(screen.getByRole('combobox', { name: 'Yield unit' })).toHaveTextContent('ml')
  })

  it('shows an empty amount for null and no unit for an empty one', () => {
    show({ amount: null, unit: '' })
    expect(screen.getByRole('spinbutton', { name: 'Yield' })).toHaveDisplayValue('')
  })

  it('reports a typed amount', async () => {
    const on = show()
    const amount = screen.getByRole('spinbutton', { name: 'Yield' })
    await userEvent.clear(amount)
    await userEvent.type(amount, '250{Enter}')
    expect(on.onAmountChange).toHaveBeenLastCalledWith(250)
  })

  it('offers the Yield units (weights, volumes, piece, portion) and reports the chosen one', async () => {
    const on = show()
    await userEvent.click(screen.getByRole('combobox', { name: 'Yield unit' }))
    for (const u of ['g', 'kg', 'l', 'cup', 'piece', 'portion']) expect(await screen.findByRole('option', { name: u })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('option', { name: 'g' }))
    expect(on.onUnitChange).toHaveBeenCalledWith('g')
  })

  it('takes other labels and another list of units', async () => {
    show({ amountLabel: 'Amount', unitLabel: 'Unit', units: ['g', 'portion'] })
    expect(screen.getByRole('spinbutton', { name: 'Amount' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('combobox', { name: 'Unit' }))
    expect(await screen.findAllByRole('option')).toHaveLength(2)
  })

  it('shows each error with its own field', () => {
    show({ amountError: 'The Yield must be more than 0.', unitError: 'Choose a unit for the Yield.' })
    expect(screen.getByRole('spinbutton', { name: 'Yield' })).toHaveAccessibleDescription(expect.stringContaining('The Yield must be more than 0.'))
    expect(screen.getByText('Choose a unit for the Yield.')).toBeInTheDocument()
  })
})
