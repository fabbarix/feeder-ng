// R2-3 (S-02 Products part, F-01, F-04; guard P4 "Pack size"): the Product page.
//   - the Ingredient link and the subtitle use displayName ("Tomato passata"); data stays lower case.
//   - pack size: sm field, "Save pack size" is the FormActions primary (not a centred tertiary button).
//   - Add barcode: the field (md) and its button share one FieldRow (button aligned to the control).
//   - Archive / Delete: FormActions, Delete (danger) as the destructive action at the far left.
import { screen } from '@testing-library/react'
import { rule, stylesheet } from '../../../test/cssRules'
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

  it('sizes the pack size sm and saves it from FormActions', async () => {
    setup()
    const field = await screen.findByLabelText('Pack size (g)')
    expect(field.closest('[data-size]')).toHaveAttribute('data-size', 'sm')
    expect(screen.getByRole('button', { name: 'Save pack size' }).closest('.form-actions__primary')).not.toBeNull()
  })

  it('puts the barcode field and Add barcode on one FieldRow', async () => {
    setup()
    const field = await screen.findByLabelText('Barcode')
    expect(field.closest('[data-size]')).toHaveAttribute('data-size', 'md')
    const row = field.closest('.field-row')
    expect(row).not.toBeNull()
    expect(row).toContainElement(screen.getByRole('button', { name: 'Add barcode' }))
  })

  it('offers Archive and Delete through FormActions, Delete as the destructive action', async () => {
    setup()
    expect((await screen.findByRole('button', { name: 'Delete Product' })).closest('.form-actions__destructive')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Archive Product' }).closest('.form-actions')).not.toBeNull()
  })

  it('marks the Barcode field as intentionally long for the layout guard (no label exemption)', async () => {
    setup()
    expect(await screen.findByLabelText('Barcode')).toHaveAttribute('data-size-intent', 'long')
  })

  it('left-aligns Add Price (a button in a Tile column does not stretch)', async () => {
    setup()
    const button = await screen.findByRole('button', { name: 'Add Price' })
    expect(button).toHaveClass('pg__add-price')
    expect(rule(stylesheet('src/features/products/products.css').base, '.pg__add-price')['align-self']).toBe('flex-start')
  })
})
