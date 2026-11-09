import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StockTakeSheet } from './StockTakeSheet'

function setup() {
  const onAction = vi.fn()
  render(<StockTakeSheet open onClose={() => {}} productName="Mutti passata 700 g" ingredientName="passata" currentStockText="1400 g" packText="700 g" onAction={onAction} />)
  return onAction
}

describe('StockTakeSheet', () => {
  it('shows the Product and the current Stock', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Stock-take: Mutti passata 700 g' })).toBeInTheDocument()
    expect(screen.getByText('In Stock now: 1400 g')).toBeInTheDocument()
  })

  it('adds or removes one pack at once', async () => {
    const onAction = setup()
    await userEvent.click(screen.getByRole('button', { name: '+1 pack' }))
    await userEvent.click(screen.getByRole('button', { name: '−1 pack' }))
    expect(onAction.mock.calls).toEqual([['plus_pack'], ['minus_pack']])
  })

  it('sets the total', async () => {
    const onAction = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Set total' }))
    await userEvent.type(screen.getByLabelText('New total'), '1500')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onAction).toHaveBeenCalledWith('set_total', 1500)
  })

  it('accepts a total of zero', async () => {
    const onAction = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Set total' }))
    await userEvent.type(screen.getByLabelText('New total'), '0')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onAction).toHaveBeenCalledWith('set_total', 0)
  })

  it('refuses a negative or empty total', async () => {
    const onAction = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Set total' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Enter an amount')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('New total'), '-5')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('The amount cannot be negative')).toBeInTheDocument()
    expect(onAction).not.toHaveBeenCalled()
  })
})
