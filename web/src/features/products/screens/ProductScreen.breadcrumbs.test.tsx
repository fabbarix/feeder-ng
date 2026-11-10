// R11a: Product detail: Products > name above the h1; the old back IconButton and "Back to Products" link are gone.
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import type { ProductDetail } from '../types'
import { ProductScreen } from './ProductScreen'

const settings = {
  timeZone: 'Europe/Rome', timeZoneConfigured: true, planningHorizonDays: 7, defaultCooldownDays: 7, defaultLeftoverUseByDays: 3,
  quietHours: { start: '22:00', end: '07:00' }, plannerStyle: 0.5, location: null, currency: 'USD',
}
const product: ProductDetail = {
  id: 5, name: 'Passata 700 g', ingredientId: 3, ingredientName: 'Tomato passata', baseUnit: 'g', packSize: 700, archived: false,
  barcodes: [], shops: [], shopBarcodes: [], latestPrices: [],
}
const api = (detail: unknown) =>
  mockApi({
    'GET /api/household/settings': settings,
    'GET /api/me/preferences': { scheme: 'system', accent: '#3f7d58', units: 'metric' },
    'GET /api/shops': [],
    'GET /api/products/5': detail,
    'GET /api/products/5/prices': [],
  })
const setup = () =>
  renderWithProviders(
    <Routes>
      <Route path="/products/:id" element={<ProductScreen />} />
    </Routes>,
    '/products/5',
  )

afterEach(() => vi.unstubAllGlobals())

describe('ProductScreen breadcrumbs', () => {
  it('shows Products > name above the h1 and no back control', async () => {
    api(product)
    const { container } = setup()
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Passata 700 g' })
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav.querySelector('a[href="/products"]')).toHaveTextContent('Products')
    expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent('Passata 700 g')
    expect(container.querySelector('.page-header')).toContainElement(nav)
    expect(nav.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('button', { name: /back to products/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /back to/i })).toBeNull()
  })

  it('the link to the Ingredient stays (it is not hierarchy)', async () => {
    api(product)
    setup()
    expect(await screen.findByRole('link', { name: 'Tomato passata' })).toHaveAttribute('href', '/ingredients/3')
  })

  it('a missing Product keeps the trail with the GLOSSARY fallback and no "Back to Products" link', async () => {
    mockApi({
      'GET /api/household/settings': settings,
      'GET /api/me/preferences': { scheme: 'system', accent: '#3f7d58', units: 'metric' },
      'GET /api/products/5': { status: 404, json: { error: { code: 'not_found', message: 'x' } } },
    })
    setup()
    expect(await screen.findByText('Product not found')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent('Product')
    expect(screen.queryByRole('link', { name: /back to/i })).toBeNull()
  })
})
