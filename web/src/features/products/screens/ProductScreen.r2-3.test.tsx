// R2-3 (S-02 Products part, F-01, F-04; guard P4 "Pack size"): the Product page.
//   - the Ingredient link and the subtitle use displayName ("Tomato passata"); data stays lower case.
//   - pack size: (B9-30: xs field, "Save pack size" beside it in one FieldRow).
//   - Add barcode: the field (md) and its button share one FieldRow (button aligned to the control).
//   - (B9-30: Archive and Delete moved into the header's ⋮ menu, see ProductScreen.b9-30.test.tsx.)
import { screen } from '@testing-library/react'
import { rule as cssRule, stylesheet } from '../../../test/cssRules'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import type { ProductDetail } from '../types'
import { ProductScreen } from './ProductScreen'

const settings = {
  timeZone: 'Europe/Rome', timeZoneConfigured: true, planningHorizonDays: 7, defaultCooldownDays: 7, defaultLeftoverUseByDays: 3,
  quietHours: { start: '22:00', end: '07:00' }, plannerStyle: 0.5, location: null, currency: 'USD',
}

const active: ProductDetail = {
  id: 5, name: 'Passata 700 g', ingredientId: 3, ingredientName: 'tomato passata', baseUnit: 'g', packSize: 700, archived: false,
  barcodes: ['08001505005707'],
  shops: [],
  shopBarcodes: [{ id: 1, shopId: 1, productId: 5, ruleId: 4, itemCode: '00123' }],
  latestPrices: [],
}

const rule = { id: 4, shopId: 1, prefix: '21', item: { start: 3, length: 5 }, value: { start: 8, length: 5 }, valueKind: 'weight', valueUnit: 'kg', decimalPlaces: 3 }

/** A stateful Product: archive/unarchive flip the flag the next GET returns. */
function setup(initial: ProductDetail = active, extra: Record<string, unknown> = {}) {
  let current = initial
  const api = mockApi({
    'GET /api/household/settings': settings,
    'GET /api/me/preferences': { scheme: 'system', accent: '#3f7d58', units: 'metric' },
    'GET /api/shops': [{ id: 1, name: 'Big Mart' }],
    'GET /api/shops/1/weight-rules': [rule],
    'GET /api/products/5': () => current,
    'GET /api/products/5/prices': [],
    'POST /api/products/5/archive': () => (current = { ...current, archived: true }),
    'POST /api/products/5/unarchive': () => (current = { ...current, archived: false }),
    'DELETE /api/products/5': { status: 204 },
    ...extra,
  })
  renderWithProviders(
    <Routes>
      <Route path="/products/:id" element={<ProductScreen />} />
      <Route path="/products" element={<p>Products list page</p>} />
    </Routes>,
    '/products/5',
  )
  return api
}

afterEach(() => vi.unstubAllGlobals())

describe('ProductScreen (R2-3)', () => {
  it('shows the Ingredient with displayName in the link', async () => {
    setup()
    expect(await screen.findByRole('link', { name: 'Tomato passata' })).toHaveAttribute('href', '/ingredients/3')
    expect(screen.queryByText('tomato passata')).toBeNull()
  })

  it('sizes the pack size xs and saves it from the FieldRow beside the field (B9-30, SET-04: Save beside its field)', async () => {
    setup()
    const field = await screen.findByLabelText('Pack size (g)')
    expect(field.closest('[data-size]')).toHaveAttribute('data-size', 'xs')
    expect(screen.getByRole('button', { name: 'Save pack size' }).closest('.field-row')).toBe(field.closest('.field-row'))
  })

  it('puts the barcode field and Add barcode on one FieldRow', async () => {
    setup()
    const field = await screen.findByLabelText('Barcode')
    expect(field.closest('[data-size]')).toHaveAttribute('data-size', 'md')
    const row = field.closest('.field-row')
    expect(row).not.toBeNull()
    expect(row).toContainElement(screen.getByRole('button', { name: 'Add barcode' }))
  })

  it('marks the Barcode field as intentionally long for the layout guard (no label exemption)', async () => {
    setup()
    expect(await screen.findByLabelText('Barcode')).toHaveAttribute('data-size-intent', 'long')
  })

  it('left-aligns Add Price (a button in a Tile column does not stretch)', async () => {
    setup()
    const button = await screen.findByRole('button', { name: 'Add Price' })
    // B9-09 (DS-07): .pg__add-price became a Cluster round the Button; a flex row never stretches its item to the Tile's width.
    expect(button.parentElement).toHaveClass('cluster')
    expect(cssRule(stylesheet('src/ui/Stack.css').base, '.cluster')['display']).toBe('flex')
  })
})
