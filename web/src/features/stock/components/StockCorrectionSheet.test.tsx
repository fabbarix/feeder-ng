// B9-45 (PC-02): ONE Correct Stock sheet for every short Ingredient: a row per Ingredient (name, what the Recipe used and Stock showed, a Stepper
// at the end), the R-B Close, one Save that gives every row's value. Leave 0 if it is all gone.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { formatQuantity } from '../../../lib/units'
import type { CorrectionRow } from '../lib/shortfall'
import { StockCorrectionSheet } from './StockCorrectionSheet'

const rows: CorrectionRow[] = [
  { ingredientId: 1, name: 'Cauliflower', baseUnit: 'g', detail: 'The Recipe used 800 g · Stock showed none' },
  { ingredientId: 2, name: 'Gorgonzola', baseUnit: 'g', detail: 'The Recipe used 250 g · Stock showed none' },
  { ingredientId: 3, name: 'Eggs', baseUnit: 'piece', detail: 'The Recipe used 6 pieces · Stock showed 2 pieces' },
]
const props = { open: true, onClose: () => {}, context: 'After cooking Cauliflower al gorgonzola', rows, onSave: () => {} }
const stepperOf = (name: string) => screen.getByRole('group', { name: `${name} left now` })
const valueOf = (name: string) => within(stepperOf(name)).getByRole('spinbutton')

describe('StockCorrectionSheet', () => {
  it('is titled "Correct Stock" with the Recipe named in the context line and the question in the lede', () => {
    render(<StockCorrectionSheet {...props} />)
    const dialog = screen.getByRole('dialog', { name: /Correct Stock/ })
    expect(within(dialog).getByRole('heading', { name: 'Correct Stock' })).toBeInTheDocument()
    expect(within(dialog).getByText('After cooking Cauliflower al gorgonzola')).toBeInTheDocument()
    expect(within(dialog).getByText('How much of each is left now, after cooking? Leave 0 if it is all gone.')).toBeInTheDocument()
  })

  it('has one row per Ingredient: its name, the detail, and a Stepper in its unit at the end, every one starting at 0', () => {
    render(<StockCorrectionSheet {...props} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('Cauliflower')).toBeInTheDocument()
    expect(screen.getByText('The Recipe used 800 g · Stock showed none')).toBeInTheDocument()
    for (const r of rows) expect(valueOf(r.name)).toHaveAttribute('aria-valuenow', '0')
    expect(within(stepperOf('Cauliflower')).getByText('g')).toBeInTheDocument()
    expect(within(stepperOf('Eggs')).getByText('piece')).toBeInTheDocument()
  })

  it('steps grams by 10 and pieces by 1, never below 0', async () => {
    render(<StockCorrectionSheet {...props} />)
    await userEvent.click(within(stepperOf('Gorgonzola')).getByRole('button', { name: /^Increase/ }))
    await userEvent.click(within(stepperOf('Gorgonzola')).getByRole('button', { name: /^Increase/ }))
    expect(valueOf('Gorgonzola')).toHaveAttribute('aria-valuenow', '20')
    await userEvent.click(within(stepperOf('Eggs')).getByRole('button', { name: /^Increase/ }))
    expect(valueOf('Eggs')).toHaveAttribute('aria-valuenow', '1')
    expect(within(stepperOf('Cauliflower')).getByRole('button', { name: /^Decrease/ })).toBeDisabled()
  })

  it('shows the steps in the User\'s unit system (the values stay in Base Units)', async () => {
    render(<StockCorrectionSheet {...props} system="imperial" />)
    await userEvent.click(within(stepperOf('Gorgonzola')).getByRole('button', { name: /^Increase/ }))
    expect(valueOf('Gorgonzola')).toHaveAttribute('aria-valuenow', '10')
    expect(valueOf('Gorgonzola')).toHaveAttribute('aria-valuetext', formatQuantity(10, 'g', 'imperial'))
  })

  it('Save gives every row\'s value by Ingredient, 0 for the ones left alone', async () => {
    const onSave = vi.fn()
    render(<StockCorrectionSheet {...props} onSave={onSave} />)
    await userEvent.click(within(stepperOf('Gorgonzola')).getByRole('button', { name: /^Increase/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith({ 1: 0, 2: 10, 3: 0 })
  })

  it('has the one circular Close of a sheet and no Cancel; Save is the one primary button', async () => {
    const onClose = vi.fn()
    render(<StockCorrectionSheet {...props} onClose={onClose} />)
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    const dialog = screen.getByRole('dialog', { name: /Correct Stock/ })
    expect(within(dialog).getAllByRole('button', { name: 'Close' })).toHaveLength(1)
    expect(within(dialog).getAllByRole('button').filter((b) => b.getAttribute('data-variant') === 'primary').map((b) => b.textContent)).toEqual(['Save'])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows a save error in the form-level FormError and disables Save while busy', () => {
    const { rerender } = render(<StockCorrectionSheet {...props} error="Could not save." />)
    expect(screen.getByText('Could not save.')).toBeInTheDocument()
    rerender(<StockCorrectionSheet {...props} busy />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('is not in the document while closed', () => {
    render(<StockCorrectionSheet {...props} open={false} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
