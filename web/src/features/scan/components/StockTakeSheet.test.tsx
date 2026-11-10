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

  it('adds or removes one pack at once, with icons on the buttons', async () => {
    const onAction = setup()
    const plus = screen.getByRole('button', { name: '+1 pack' })
    const minus = screen.getByRole('button', { name: '−1 pack' })
    expect(plus.querySelector('svg')).not.toBeNull()
    expect(minus.querySelector('svg')).not.toBeNull()
    await userEvent.click(plus)
    await userEvent.click(minus)
    expect(onAction.mock.calls).toEqual([['plus_pack'], ['minus_pack']])
  })

  it('sets the total with a NumberField', async () => {
    const onAction = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Set total' }))
    const field = screen.getByRole('spinbutton', { name: 'New total' })
    expect(field).not.toHaveAttribute('type', 'number')
    await userEvent.type(field, '1500')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onAction).toHaveBeenCalledWith('set_total', 1500)
  })

  it('accepts a total of zero', async () => {
    const onAction = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Set total' }))
    await userEvent.type(screen.getByRole('spinbutton', { name: 'New total' }), '0')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onAction).toHaveBeenCalledWith('set_total', 0)
  })

  it('refuses an empty total, and the field never holds a negative one', async () => {
    const onAction = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Set total' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Enter an amount')).toBeInTheDocument()
    const field = screen.getByRole('spinbutton', { name: 'New total' })
    await userEvent.type(field, '-5')
    await userEvent.tab()
    expect(field).toHaveValue('0')
    expect(onAction).not.toHaveBeenCalled()
  })
})
