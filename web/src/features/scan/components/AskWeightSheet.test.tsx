import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AskWeightSheet } from './AskWeightSheet'

function setup() {
  const onSubmit = vi.fn()
  render(<AskWeightSheet open onClose={() => {}} productName="Loose cheese" priceText="$2.50" onSubmit={onSubmit} />)
  return onSubmit
}

describe('AskWeightSheet', () => {
  it('names the Product and the label price and explains why it asks', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'How much does it weigh?' })).toBeInTheDocument()
    expect(screen.getByText(/Loose cheese/)).toBeInTheDocument()
    expect(screen.getByText(/\$2\.50/)).toBeInTheDocument()
    expect(screen.getByText('Weigh it once; the price per kg is remembered for next time.')).toBeInTheDocument()
  })

  it('submits the weight in grams', async () => {
    const onSubmit = setup()
    await userEvent.type(screen.getByLabelText('Weight (g)'), '500')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith(500)
  })

  it.each([[''], ['0'], ['heavy']])('does not submit %j', async (text) => {
    const onSubmit = setup()
    if (text) await userEvent.type(screen.getByLabelText('Weight (g)'), text)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Enter a number above 0')).toBeInTheDocument()
  })
})
