// R2-3 (F-01, F-04): Price and Price per kg are short: both sm, side by side in one FieldRow. B9-14 (VC2): the editor is the
// "Add Price" sheet; Cancel and Save Price are its footer (Save the primary submit of the body's form, last) and it has no Close.
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
  it('puts Cancel and Save Price in the sheet footer, Save the primary submit of the form, and shows no Close (VC2)', () => {
    setup()
    const save = screen.getByRole('button', { name: 'Save Price' })
    const footer = save.closest('.sheet__footer') as HTMLElement
    expect(footer).not.toBeNull()
    expect(save).toHaveAttribute('data-variant', 'primary')
    expect(save).toHaveAttribute('type', 'submit')
    expect(document.getElementById(save.getAttribute('form')!)?.tagName).toBe('FORM')
    expect([...footer.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Cancel', 'Save Price'])
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    expect(document.querySelector('.pg__row')).toBeNull()
  })
})
