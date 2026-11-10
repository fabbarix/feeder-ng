import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PriceEditSheet } from './PriceEditSheet'

function setup(priceCents: number | null = 159, currency = 'USD') {
  const onSave = vi.fn()
  render(<PriceEditSheet open onClose={() => {}} productName="Mutti passata 700 g" priceCents={priceCents} currency={currency} onSave={onSave} />)
  return onSave
}

describe('PriceEditSheet', () => {
  it('is titled for the Product and prefilled with the current price', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Price of Mutti passata 700 g' })).toBeInTheDocument()
    expect(screen.getByLabelText('Price')).toHaveValue('1.59')
  })

  it('saves the edited price in minor units', async () => {
    const onSave = setup()
    const field = screen.getByLabelText('Price')
    await userEvent.clear(field)
    await userEvent.type(field, '1,79')
    await userEvent.click(screen.getByRole('button', { name: 'Save price' }))
    expect(onSave).toHaveBeenCalledWith(179)
  })

  it('starts empty when no price is known', () => {
    setup(null)
    expect(screen.getByLabelText('Price')).toHaveValue('')
  })

  it.each([[''], ['0'], ['abc'], ['1.599']])('does not save %j', async (text) => {
    const onSave = setup()
    const field = screen.getByLabelText('Price')
    await userEvent.clear(field)
    if (text) await userEvent.type(field, text)
    await userEvent.click(screen.getByRole('button', { name: 'Save price' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('Enter a number above 0')).toBeInTheDocument()
  })
})
