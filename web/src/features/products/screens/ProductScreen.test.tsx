import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { findNotice } from '../../../test/notices'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import type { ProductDetail } from '../types'
import { ProductScreen } from './ProductScreen'

const settings = {
  timeZone: 'Europe/Rome', timeZoneConfigured: true, planningHorizonDays: 7, defaultCooldownDays: 7, defaultLeftoverUseByDays: 3,
  quietHours: { start: '22:00', end: '07:00' }, plannerStyle: 0.5, location: null, currency: 'USD',
}

const active: ProductDetail = {
  id: 5, name: 'Passata 700 g', ingredientId: 3, ingredientName: 'Tomato passata', baseUnit: 'g', packSize: 700, archived: false,
  barcodes: ['08001505005707'],
  shops: [],
  shopBarcodes: [{ id: 1, shopId: 1, productId: 5, ruleId: 4, itemCode: '00123' }],
  latestPrices: [],
}
const archived: ProductDetail = { ...active, archived: true }

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

describe('ProductScreen barcodes (QA)', () => {
  it('shows a human EAN-13, never the 14-digit GTIN', async () => {
    setup()
    expect(await screen.findByText('8 001505 005707')).toBeInTheDocument()
    expect(screen.queryByText('08001505005707')).toBeNull()
  })

  it('removes a barcode by its stored code even though the label is human', async () => {
    const api = setup(active, { 'DELETE /api/products/5/barcodes/08001505005707': { status: 204 } })
    await userEvent.click(await screen.findByRole('button', { name: 'Remove barcode 8 001505 005707' }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/products/5/barcodes/08001505005707')).toHaveLength(1))
  })

  it('names a weighed Shop Barcode by the rule prefix, not the rule id ("rule 4" vs "rule 21")', async () => {
    setup()
    expect(await screen.findByText(/Big Mart · Weighed · prefix 21 · item 00123/)).toBeInTheDocument()
    expect(screen.queryByText(/rule 4/i)).toBeNull()
  })
})

describe('ProductScreen archive (R8)', () => {
  it('archives after a ConfirmDialog, then shows the Archived chip and Unarchive', async () => {
    const api = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Archive Product' }))
    const dialog = await screen.findByRole('dialog', { name: 'Archive Passata 700 g?' })
    expect(within(dialog).getByText(/left out of lists and Scans/)).toBeInTheDocument()
    expect(within(dialog).getByText(/history stays/i)).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/products/5/archive')).toHaveLength(0)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/products/5/archive')).toHaveLength(1))
    expect(await screen.findByRole('button', { name: 'Unarchive Product' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive Product' })).toBeNull()
    expect(screen.getByText('Archived', { selector: '.chip, .chip *' })).toBeInTheDocument()
    expect(await findNotice('status', 'Passata 700 g archived')).toBeInTheDocument()
  })

  it('cancelling the ConfirmDialog archives nothing', async () => {
    const api = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Archive Product' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Archive Passata 700 g?' })).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.callsTo('POST', '/api/products/5/archive')).toHaveLength(0)
  })

  it('never uses the native confirm', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Archive Product' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete Product' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(confirm).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('shows an archived Product with the Archived chip and offers Unarchive without a dialog', async () => {
    const api = setup(archived)
    expect(await screen.findByRole('heading', { level: 1, name: 'Passata 700 g' })).toBeInTheDocument()
    expect(screen.getByText('Archived', { selector: '.chip, .chip *' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive Product' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Unarchive Product' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/products/5/unarchive')).toHaveLength(1))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByRole('button', { name: 'Archive Product' })).toBeInTheDocument()
    expect(screen.queryByText('Archived', { selector: '.chip, .chip *' })).toBeNull()
  })

  it('explains what Archived means on an archived Product (GLOSSARY: retired, history stays, can be unarchived)', async () => {
    setup(archived)
    expect(await screen.findByText(/retired/i)).toBeInTheDocument()
    expect(screen.queryByText(/\b(deleted|disabled|hidden|inactive)\b/i)).toBeNull()
  })
})

describe('ProductScreen delete (R8)', () => {
  it('deletes a never-bought Product after a danger ConfirmDialog and returns to the list', async () => {
    const api = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Product' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete Passata 700 g?' })
    expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus() // danger focuses Cancel
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/products/5')).toHaveLength(1))
    expect(await screen.findByText('Products list page')).toBeInTheDocument()
  })

  it('on 409 product_bought explains it and offers to archive instead', async () => {
    const api = setup(active, {
      'DELETE /api/products/5': { status: 409, json: { error: { code: 'product_bought', message: 'bought: archive it instead' } } },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Product' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete Passata 700 g?' })).getByRole('button', { name: 'Delete' }))
    const hint = await screen.findByRole('dialog', { name: 'Passata 700 g has been bought' })
    expect(within(hint).getByText(/cannot be deleted/i)).toBeInTheDocument()
    expect(within(hint).getByText(/archive it/i)).toBeInTheDocument()
    expect(screen.queryByText('Products list page')).toBeNull()
    await userEvent.click(within(hint).getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/products/5/archive')).toHaveLength(1))
    expect(await screen.findByRole('button', { name: 'Unarchive Product' })).toBeInTheDocument()
  })

  it('declining the archive hint keeps the Product active and shows no raw server text', async () => {
    const api = setup(active, {
      'DELETE /api/products/5': { status: 409, json: { error: { code: 'product_bought', message: 'raw server message' } } },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Product' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Passata 700 g has been bought' })).getByRole('button', { name: 'Keep' }))
    expect(api.callsTo('POST', '/api/products/5/archive')).toHaveLength(0)
    expect(screen.queryByText('raw server message')).toBeNull()
    expect(screen.getByRole('button', { name: 'Archive Product' })).toBeInTheDocument()
  })

  it('another failure while deleting is shown as an alert, not as the bought hint', async () => {
    setup(active, { 'DELETE /api/products/5': { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Product' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(await findNotice('alert', 'boom')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
