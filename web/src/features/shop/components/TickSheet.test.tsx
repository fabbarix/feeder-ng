import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TickSheet } from './TickSheet'

function setup(defaultQuantity = 1400) {
  const onSubmit = vi.fn()
  render(<TickSheet open onClose={() => {}} name="Passata" baseUnit="g" defaultQuantity={defaultQuantity} onSubmit={onSubmit} />)
  return onSubmit
}

describe('TickSheet', () => {
  it('asks how much, prefilled with the Line quantity', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Tick Passata' })).toBeInTheDocument()
    expect(screen.getByLabelText('How much?')).toHaveValue('1400')
    expect(screen.getByText('g')).toBeInTheDocument()
  })

  it('adds a Stock Lot of the amount asked', async () => {
    const onSubmit = setup()
    const field = screen.getByLabelText('How much?')
    await userEvent.clear(field)
    await userEvent.type(field, '1,5')
    await userEvent.click(screen.getByRole('button', { name: 'Tick and add to Stock' }))
    expect(onSubmit).toHaveBeenCalledWith(1.5)
  })

  it('submits the prefilled amount as is', async () => {
    const onSubmit = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Tick and add to Stock' }))
    expect(onSubmit).toHaveBeenCalledWith(1400)
  })

  it('can tick without adding anything', async () => {
    const onSubmit = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Tick without adding' }))
    expect(onSubmit).toHaveBeenCalledWith(0)
  })

  it('shows an error and does not submit a negative or empty amount', async () => {
    const onSubmit = setup()
    const field = screen.getByLabelText('How much?')
    await userEvent.clear(field)
    await userEvent.click(screen.getByRole('button', { name: 'Tick and add to Stock' }))
    expect(screen.getByText('Enter an amount')).toBeInTheDocument()
    await userEvent.type(field, '-3')
    await userEvent.click(screen.getByRole('button', { name: 'Tick and add to Stock' }))
    expect(screen.getByText('The amount cannot be negative')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
