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
  it('asks how much with a NumberField (unit shown), prefilled with the Line quantity', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Tick Passata' })).toBeInTheDocument()
    const field = screen.getByRole('spinbutton', { name: 'How much?' })
    expect(field).toHaveValue('1400')
    expect(field).not.toHaveAttribute('type', 'number')
    expect(screen.getByText('g')).toBeInTheDocument()
  })

  it('adds a Stock Lot of the amount asked, accepting a decimal comma', async () => {
    const onSubmit = setup()
    const field = screen.getByRole('spinbutton', { name: 'How much?' })
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

  it('the add button is the only primary Button', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Tick and add to Stock' })).toHaveAttribute('data-variant', 'primary')
    expect(screen.getByRole('button', { name: 'Tick without adding' })).toHaveAttribute('data-variant', 'secondary')
  })

  it('an empty amount shows an error and does not submit; a negative one is clamped to 0 by the field', async () => {
    const onSubmit = setup()
    const field = screen.getByRole('spinbutton', { name: 'How much?' })
    await userEvent.clear(field)
    await userEvent.click(screen.getByRole('button', { name: 'Tick and add to Stock' }))
    expect(screen.getByText('Enter an amount')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
    await userEvent.type(field, '-3')
    await userEvent.tab()
    expect(field).toHaveValue('0')
  })
})
