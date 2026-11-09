import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeTotal } from '../testData'
import { StockTile } from './StockTile'

describe('StockTile', () => {
  it('shows the Ingredient, its total and the lot count', () => {
    render(<StockTile item={makeTotal({ name: 'chicken thighs', total: 800, lotCount: 2 })} onOpen={() => {}} />)
    expect(screen.getByText('chicken thighs')).toBeInTheDocument()
    expect(screen.getByText('800 g')).toBeInTheDocument()
    expect(screen.getByText('2 Stock Lots')).toBeInTheDocument()
    expect(screen.queryByText('Use soon')).toBeNull()
  })

  it('highlights use-soon with the fixed spoil tone', () => {
    render(<StockTile item={makeTotal({ useSoon: true })} onOpen={() => {}} />)
    const chip = screen.getByText('Use soon')
    expect(chip.closest('[data-tone]')).toHaveAttribute('data-tone', 'spoil')
    expect(screen.getByRole('button', { name: /chicken thighs/ })).toHaveAttribute('data-tone', 'spoil')
  })

  it('is neutral when nothing goes off soon', () => {
    render(<StockTile item={makeTotal()} onOpen={() => {}} />)
    expect(screen.getByRole('button', { name: /chicken thighs/ })).toHaveAttribute('data-tone', 'neutral')
  })

  it('opens the Ingredient on click', async () => {
    const onOpen = vi.fn()
    render(<StockTile item={makeTotal({ ingredientId: 9 })} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onOpen).toHaveBeenCalledWith(9)
  })
})
