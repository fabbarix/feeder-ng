// R2-4 L-06 / S-05 style: the Shop picker is a narrow Page screen with the shared PageHeader and EmptyState, no hand-made heading or paragraph.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ShopPicker } from './ShopPicker'

describe('ShopPicker page structure', () => {
  it('the h1 "Where are you shopping?" is the shared PageHeader, with the hint as its subtitle', () => {
    render(<ShopPicker shops={[{ id: 1, name: 'Aldi' }]} lastShopId={null} onPick={() => {}} onStockTake={() => {}} />)
    const h1 = screen.getByRole('heading', { level: 1, name: 'Where are you shopping?' })
    expect(h1.closest('header.page-header')).not.toBeNull()
    expect(document.querySelector('.shop-picker__title')).toBeNull()
    expect(document.querySelector('.page-header')).toHaveTextContent('Pick the Shop')
  })
  it('with no Shops it shows an EmptyState, not a bare paragraph, and still offers Stock-take at home', () => {
    render(<ShopPicker shops={[]} lastShopId={null} onPick={() => {}} onStockTake={() => {}} />)
    expect(document.querySelector('.empty-state')).toHaveTextContent('No Shops yet')
    expect(document.querySelector('.shop-picker__empty')).toBeNull()
    expect(screen.getByRole('button', { name: 'Stock-take at home' })).toBeInTheDocument()
  })
})
