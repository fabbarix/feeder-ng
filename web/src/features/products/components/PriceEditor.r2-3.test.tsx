// R2-3 (F-01, F-04): Price and Price per kg are short: both sm, side by side in one FieldRow. Save Price is the FormActions
// primary, Cancel its tertiary (right-aligned from 600 px, primary last).
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PriceEditor } from './PriceEditor'

const setup = () =>
  render(<PriceEditor shops={[{ id: 1, name: 'Big Mart' }]} latestByShop={{}} currency="USD" today="2026-11-09" onSave={vi.fn()} onCancel={vi.fn()} />)

describe('PriceEditor (R2-3)', () => {
  it('sizes Price and Price per kg to sm, on one FieldRow', () => {
    setup()
    const price = screen.getByLabelText('Price')
    const perKg = screen.getByLabelText('Price per kg')
    expect(price.closest('[data-size]')).toHaveAttribute('data-size', 'sm')
    expect(perKg.closest('[data-size]')).toHaveAttribute('data-size', 'sm')
    expect(price.closest('.field-row')).not.toBeNull()
    expect(perKg.closest('.field-row')).toBe(price.closest('.field-row'))
  })
  it('uses FormActions: Save Price primary, Cancel tertiary', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Save Price' }).closest('.form-actions__primary')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Cancel' }).closest('.form-actions__tertiary')).not.toBeNull()
    expect(document.querySelector('.pg__row')).toBeNull()
  })
})
