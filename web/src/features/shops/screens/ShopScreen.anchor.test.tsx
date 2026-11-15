// batch w5a (B9-41, SSP-15): Scan's "Set up the rule" opens /settings/shops/:id#weight-barcode-rules; the Shop page's Weight Barcode
// Rules section carries that id and is scrolled into view once it is on the page.
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_ME, mockApi, renderWithProviders } from '../../settings/test-utils'
import { ShopScreen } from './ShopScreen'

afterEach(() => vi.unstubAllGlobals())

function setup(route: string) {
  mockApi({
    'GET /api/me': ADMIN_ME,
    'GET /api/shops': [{ id: 4, name: 'Coop', location: null, priceCount: 0 }],
    'GET /api/shops/4/weight-rules': [],
    'GET /api/shops/4/barcodes': [],
    'GET /api/shops/4/prices': [],
    'GET /api/shops/4/impact': { shopBarcodes: 0, weightBarcodeRules: 0, prices: 0 },
    'GET /api/ingredients': [],
    'GET /api/products': [],
    'GET /api/household/settings': { currency: 'USD' },
  })
  renderWithProviders(
    <Routes>
      <Route path="/settings/shops/:id" element={<ShopScreen />} />
    </Routes>,
    route,
  )
}

describe('the Shop page at its Weight Barcode Rules (SSP-15)', () => {
  it('the section has the anchor id and is scrolled into view for #weight-barcode-rules', async () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    setup('/settings/shops/4#weight-barcode-rules')
    const section = await screen.findByRole('region', { name: 'Weight Barcode Rules' })
    expect(section.id).toBe('weight-barcode-rules')
    await vi.waitFor(() => expect(scroll).toHaveBeenCalledTimes(1))
    expect(scroll.mock.contexts[0]).toBe(section)
  })

  it('without a hash nothing is scrolled', async () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    setup('/settings/shops/4')
    await screen.findByRole('region', { name: 'Weight Barcode Rules' })
    expect(scroll).not.toHaveBeenCalled()
  })
})
