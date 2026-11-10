import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { StockWarning } from '../types'
import { ShortfallNotice } from './ShortfallNotice'

const warning: StockWarning = {
  ingredientId: 7, name: 'chicken thighs', baseUnit: 'g', have: 300, need: 800, shortfall: 500,
  message: 'Stock shows only 300 g chicken thighs, the recipe uses 800 g',
}

describe('ShortfallNotice', () => {
  it('shows the warning text', () => {
    render(<ShortfallNotice warning={warning} onCorrect={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(warning.message)).toBeInTheDocument()
  })

  it('corrects Stock in one tap, passing the warning', async () => {
    const onCorrect = vi.fn()
    render(<ShortfallNotice warning={warning} onCorrect={onCorrect} onDismiss={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Correct Stock' }))
    expect(onCorrect).toHaveBeenCalledWith(warning)
  })

  it('dismisses without correcting', async () => {
    const onCorrect = vi.fn()
    const onDismiss = vi.fn()
    render(<ShortfallNotice warning={warning} onCorrect={onCorrect} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onCorrect).not.toHaveBeenCalled()
  })

  it('is a spoil status Tile; Correct Stock is secondary, Dismiss tertiary', () => {
    render(<ShortfallNotice warning={warning} onCorrect={() => {}} onDismiss={() => {}} />)
    const tile = screen.getByText(warning.message).closest('.tile')
    expect(tile).toHaveAttribute('data-variant', 'status')
    expect(tile).toHaveAttribute('data-status', 'spoil')
    expect(tile).not.toHaveAttribute('data-tone')
    expect(screen.getByRole('button', { name: 'Correct Stock' })).toHaveAttribute('data-variant', 'secondary')
    expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveAttribute('data-variant', 'tertiary')
  })
})
