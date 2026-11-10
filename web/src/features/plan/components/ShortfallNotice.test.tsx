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

  it('is a danger-spoil status tile; Correct Stock is secondary, Dismiss tertiary', () => {
    render(<ShortfallNotice warning={warning} onCorrect={() => {}} onDismiss={() => {}} />)
    expect(screen.getByRole('alert')).toHaveAttribute('data-variant', 'status')
    expect(screen.getByRole('button', { name: 'Correct Stock' })).toHaveAttribute('data-variant', 'secondary')
    expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveAttribute('data-variant', 'tertiary')
  })
})

describe('StockCorrectionSheet', () => {
  const correction = { ingredientId: 11, ingredient: 'chicken thighs', total: 0 }

  it('is prefilled with the post-cook total and saves what the User types', async () => {
    const onSave = vi.fn()
    render(<StockCorrectionSheet open onClose={() => {}} correction={correction} onSave={onSave} busy={false} error={null} />)
    expect(screen.getByRole('dialog', { name: 'How much chicken thighs do you have?' })).toBeInTheDocument()
    const input = screen.getByRole('spinbutton', { name: 'Total in Stock' }) // a NumberField, not a native text input
    expect(input).toHaveValue('0')
    await userEvent.clear(input)
    await userEvent.type(input, '250')
    await userEvent.click(screen.getByRole('button', { name: 'Set total' }))
    expect(onSave).toHaveBeenCalledWith(250)
  })

  it('refuses an empty total', async () => {
    const onSave = vi.fn()
    render(<StockCorrectionSheet open onClose={() => {}} correction={correction} onSave={onSave} busy={false} error={null} />)
    await userEvent.clear(screen.getByRole('spinbutton', { name: 'Total in Stock' }))
    await userEvent.click(screen.getByRole('button', { name: 'Set total' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a number, 0 or more.')
  })

  it('accepts a comma as the decimal mark', async () => {
    const onSave = vi.fn()
    render(<StockCorrectionSheet open onClose={() => {}} correction={correction} onSave={onSave} busy={false} error={null} />)
    const input = screen.getByRole('spinbutton', { name: 'Total in Stock' })
    await userEvent.clear(input)
    await userEvent.type(input, '2,5')
    await userEvent.click(screen.getByRole('button', { name: 'Set total' }))
    expect(onSave).toHaveBeenCalledWith(2.5)
  })
})
