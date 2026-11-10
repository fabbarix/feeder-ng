import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SetTotalSheet } from './SetTotalSheet'

function setup(initial = 800) {
  const onSubmit = vi.fn()
  render(<SetTotalSheet open onClose={() => {}} name="chicken thighs" baseUnit="g" initial={initial} onSubmit={onSubmit} />)
  return onSubmit
}

describe('SetTotalSheet', () => {
  it('puts its field in the same token-gap stack as the Add sheet', () => {
    setup()
    expect(screen.getByRole('dialog').querySelector('.stock-sheet__fields')).toContainElement(screen.getByLabelText('New total'))
  })

  it('is titled for the Ingredient and prefilled, with the Base Unit as suffix, and has no native control but the field', () => {
    setup(0)
    expect(screen.getByRole('dialog', { name: 'Set total for chicken thighs' })).toBeInTheDocument()
    expect(screen.getByLabelText('New total')).toHaveValue('0')
    expect(screen.getByRole('dialog').querySelector('select, input[type="number"], input[type="date"]')).toBeNull()
    expect(screen.getByText('g', { selector: '.ui-field__suffix' })).toBeInTheDocument()
  })

  it('submits the typed total as a number', async () => {
    const onSubmit = setup()
    const input = screen.getByLabelText('New total')
    await userEvent.clear(input)
    await userEvent.type(input, '1,5')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith(1.5)
  })

  it('accepts zero', async () => {
    const onSubmit = setup()
    const input = screen.getByLabelText('New total')
    await userEvent.clear(input)
    await userEvent.type(input, '0')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith(0)
  })

  it('shows an error and does not submit a negative total', async () => {
    const onSubmit = setup()
    const input = screen.getByLabelText('New total')
    await userEvent.clear(input)
    await userEvent.type(input, '-5')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('The amount cannot be negative')).toBeInTheDocument()
    expect(screen.getByLabelText('New total')).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows an error for an empty entry', async () => {
    const onSubmit = setup()
    await userEvent.clear(screen.getByLabelText('New total'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Enter an amount')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
