import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { StockWarning } from '../types'
import { ShortfallNotice } from './ShortfallNotice'
import { StockCorrectionSheet } from './StockCorrectionSheet'

const warning: StockWarning = {
  ingredientId: 11, name: 'chicken thighs', baseUnit: 'g', have: 300, need: 800, shortfall: 500,
  message: 'Stock shows only 300 g chicken thighs, the recipe uses 800 g',
}

describe('ShortfallNotice', () => {
  it('shows the warning and offers a one-tap correction or dismissal', async () => {
    const onCorrect = vi.fn()
    const onDismiss = vi.fn()
    render(<ShortfallNotice warning={warning} onCorrect={onCorrect} onDismiss={onDismiss} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Stock shows only 300 g chicken thighs, the recipe uses 800 g')
    await userEvent.click(screen.getByRole('button', { name: 'Correct Stock' }))
    expect(onCorrect).toHaveBeenCalledWith(warning)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledWith(warning)
  })
})

describe('StockCorrectionSheet', () => {
  const correction = { ingredientId: 11, ingredient: 'chicken thighs', total: 0 }

  it('is prefilled with the post-cook total and saves what the User types', async () => {
    const onSave = vi.fn()
    render(<StockCorrectionSheet open onClose={() => {}} correction={correction} onSave={onSave} busy={false} error={null} />)
    expect(screen.getByRole('dialog', { name: 'How much chicken thighs do you have?' })).toBeInTheDocument()
    const input = screen.getByLabelText('Total in Stock')
    expect(input).toHaveValue('0')
    await userEvent.clear(input)
    await userEvent.type(input, '250')
    await userEvent.click(screen.getByRole('button', { name: 'Set total' }))
    expect(onSave).toHaveBeenCalledWith(250)
  })

  it('refuses a total that is not a number', async () => {
    const onSave = vi.fn()
    render(<StockCorrectionSheet open onClose={() => {}} correction={correction} onSave={onSave} busy={false} error={null} />)
    const input = screen.getByLabelText('Total in Stock')
    await userEvent.clear(input)
    await userEvent.type(input, 'lots')
    await userEvent.click(screen.getByRole('button', { name: 'Set total' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
