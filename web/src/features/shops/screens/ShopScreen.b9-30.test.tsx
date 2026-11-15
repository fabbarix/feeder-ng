// B9-30 (SET-02, SET-14b, SAFE-02, SAFE-04, SET-01 flow): the Shop page.
// API pinned:
//   - Prices known here: ONE request, GET /api/shops/{id}/prices (no per-Product `prices/latest` requests, no dependence on Shop Barcodes);
//     the tile header "Prices known here" with the count "12 Products" at its end and the note "The latest Price of each Product at Coop.";
//     ListRows with the Thumb, the Product name, the date as meta, the price as value and the price per kg as sub-value, a chevron to the
//     Product page, named "<Product>, <price> on <date>"; the first 8, then an outline "Show all 12 Prices" (aria-expanded) that expands in
//     place and moves focus to the first newly shown row; three skeleton rows while loading; the empty copy.
//   - Delete Shop: a ConfirmDialog (danger) titled "Delete Coop?", the counts from GET /api/shops/{id}/impact as DetailList rows under
//     "Goes with Coop" (Shop Barcodes, Weight Barcode Rules, Prices; only the non-zero ones), the note "Products stay. This can't be
//     undone.", outline Cancel focused, no Close, confirm "Delete Shop". Nothing recorded: the lead says so and there are no rows.
//   - Removing a Shop Barcode acts at once and shows a one-line toast "Shop Barcode <label> removed" with Undo; Undo re-adds it.
//   - A failed action shows in a FormError (role=alert, .form-error), never a loose `.pg__error`.
//   - Adding a Shop Barcode ends with the polite toast "Shop Barcode added" and focus back on "Add Shop Barcode".
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { findToast } from '../../../test/notices'
import { ADMIN_ME, USER_ME, mockApi, renderWithProviders } from '../../settings/test-utils'
import { ShopScreen } from './ShopScreen'
import { vi } from 'vitest'

afterEach(() => vi.unstubAllGlobals())

const YEAR = new Date().getFullYear()
const wire = (id: number, name: string, over: Record<string, unknown> = {}) => ({
  product: { id, name, image: '', imageUrl: '' },
  price: { id: 100 + id, productId: id, shopId: 4, date: `${YEAR}-01-14`, priceCents: 374, pricePerKgCents: 1496, pricePerKgDerived: true, ...over },
})
const twelve = Array.from({ length: 12 }, (_, i) => wire(i + 1, `Product ${String(i + 1).padStart(2, '0')}`))
const noImpact = { shopBarcodes: 0, weightBarcodeRules: 0, prices: 0 }

function setup(extra: Record<string, unknown> = {}, me = ADMIN_ME) {
  const api = mockApi({
    'GET /api/me': me,
    'GET /api/shops': [{ id: 4, name: 'Coop', location: null, priceCount: 12 }],
    'GET /api/shops/4/weight-rules': [],
    'GET /api/shops/4/barcodes': [],
    'GET /api/shops/4/prices': twelve,
    'GET /api/shops/4/impact': noImpact,
    'GET /api/ingredients': [],
    'GET /api/products': [{ id: 7, name: 'Mutti passata', ingredientId: 3, ingredientName: 'Tomato passata', baseUnit: 'g', packSize: 700 }],
    'GET /api/household/settings': { currency: 'USD' },
    ...extra,
  })
  renderWithProviders(
    <Routes>
      <Route path="/settings/shops/:id" element={<ShopScreen />} />
      <Route path="/settings/shops" element={<p>Shops list page</p>} />
    </Routes>,
    '/settings/shops/4',
  )
  return api
}
const pricesTile = async () => (await screen.findByRole('region', { name: 'Prices known here' })) as HTMLElement

describe('Prices known here (SET-02)', () => {
  it('reads the Prices by Shop in one request, with no Shop Barcode and no per-Product request', async () => {
    const api = setup()
    await pricesTile()
    await waitFor(() => expect(api.callsTo('GET', '/api/shops/4/prices')).toHaveLength(1))
    expect(api.calls.some((c) => c.path.includes('/prices/latest'))).toBe(false)
  })

  it('header with the count, the note, and rows with a value column', async () => {
    setup({ 'GET /api/shops/4/prices': [wire(7, 'Butter')] })
    const tile = await pricesTile()
    expect(await within(tile).findByText('1 Product')).toBeInTheDocument()
    expect(within(tile).getByText('The latest Price of each Product at Coop.')).toBeInTheDocument()
    const row = within(tile).getByRole('link', { name: 'Butter, $3.74 on 14 Jan' })
    expect(row).toHaveAttribute('href', '/products/7')
    const li = row.closest('li')!
    expect(li.classList.contains('list-row')).toBe(true)
    expect(li.querySelector('.list-row__value')).toHaveTextContent('$3.74')
    expect(li.querySelector('.list-row__sub-value')).toHaveTextContent('$14.96 / kg')
    expect(li.querySelector('.list-row__meta')).toHaveTextContent('14 Jan')
    expect(li.querySelector('.list-row__chevron, [data-chevron]')).not.toBeNull()
    expect(li.textContent).not.toContain(`${YEAR}-01-14`)
  })

  it('shows the first 8 rows and an outline "Show all 12 Prices"; it expands in place and focuses the first new row', async () => {
    setup()
    const tile = await pricesTile()
    await within(tile).findByText('Product 01')
    expect(tile.querySelectorAll('.list-row')).toHaveLength(8)
    const more = within(tile).getByRole('button', { name: 'Show all 12 Prices' })
    expect(more).toHaveAttribute('data-variant', 'secondary')
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(more)
    expect(tile.querySelectorAll('.list-row')).toHaveLength(12)
    expect(within(tile).getByRole('button', { name: 'Show all 12 Prices' })).toHaveAttribute('aria-expanded', 'true')
    expect(within(tile).getByRole('link', { name: /^Product 09,/ })).toHaveFocus()
  })

  it('has no "Show all" with 8 Prices or fewer', async () => {
    setup({ 'GET /api/shops/4/prices': twelve.slice(0, 8) })
    const tile = await pricesTile()
    await within(tile).findByText('Product 08')
    expect(within(tile).queryByRole('button', { name: /Show all/ })).toBeNull()
  })

  it('says how a Price is recorded when there is none', async () => {
    setup({ 'GET /api/shops/4/prices': [] })
    const tile = await pricesTile()
    expect(await within(tile).findByText('No Prices recorded at Coop yet. A Price is recorded when a receipt from Coop is read, or when you add one on a Product.')).toBeInTheDocument()
    expect(tile.querySelector('.list-row')).toBeNull()
  })

  it('while the Prices load the tile holds three skeleton rows, not the empty text', async () => {
    setup({ 'GET /api/shops/4/prices': () => new Promise(() => {}) })
    const tile = await pricesTile()
    expect(tile.querySelectorAll('.skeleton-row')).toHaveLength(3)
    expect(within(tile).queryByText(/No Prices recorded/)).toBeNull()
  })
})

describe('Delete Shop (SAFE-02): a confirm with the counts as rows', () => {
  const open = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Shop' }))
    return screen.findByRole('dialog', { name: 'Delete Coop?' })
  }

  it('lists what goes as rows from the impact read, not as a paragraph', async () => {
    const api = setup({ 'GET /api/shops/4/impact': { shopBarcodes: 3, weightBarcodeRules: 1, prices: 12 } })
    const dialog = await open()
    expect(api.callsTo('GET', '/api/shops/4/impact')).toHaveLength(1)
    const list = within(dialog).getByRole('list', { name: 'Goes with Coop' })
    const rows = within(list).getAllByRole('listitem').map((li) => li.textContent)
    expect(rows).toEqual([expect.stringMatching(/Shop Barcodes.*3/), expect.stringMatching(/Weight Barcode Rules.*1/), expect.stringMatching(/Prices.*12/)])
    expect(dialog.textContent).toMatch(/Products stay\. This can.t be undone\./)
    expect(dialog.textContent).not.toContain('go too')
  })

  it('leaves out a count of zero', async () => {
    setup({ 'GET /api/shops/4/impact': { shopBarcodes: 0, weightBarcodeRules: 0, prices: 5 } })
    const dialog = await open()
    const rows = within(within(dialog).getByRole('list', { name: 'Goes with Coop' })).getAllByRole('listitem')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Prices')
  })

  it('with nothing recorded the lead says so and there are no rows', async () => {
    setup()
    const dialog = await open()
    expect(within(dialog).getByText('It has no Shop Barcodes, Weight Barcode Rules or Prices yet.')).toBeInTheDocument()
    expect(within(dialog).queryByRole('list')).toBeNull()
  })

  it('has an outline Cancel with focus, no Close, and a danger "Delete Shop"; nothing is deleted until it is chosen', async () => {
    const api = setup()
    const dialog = await open()
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
    expect(cancel).toHaveFocus()
    expect(cancel).toHaveAttribute('data-variant', 'secondary')
    expect(within(dialog).queryByRole('button', { name: /^close$/i })).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Delete Shop' })).toHaveAttribute('data-variant', 'danger')
    await userEvent.click(cancel)
    expect(api.callsTo('DELETE', '/api/shops/4')).toHaveLength(0)
  })

  it('deleting calls DELETE and goes back to the Shops', async () => {
    const api = setup({ 'DELETE /api/shops/4': { status: 204 } })
    const dialog = await open()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Shop' }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/shops/4')).toHaveLength(1))
    expect(await screen.findByText('Shops list page')).toBeInTheDocument()
  })

  it('still asks, with the plain sentence, when the impact cannot be read', async () => {
    setup({ 'GET /api/shops/4/impact': { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    const dialog = await open()
    expect(within(dialog).getByText(/Its Shop Barcodes, Weight Barcode Rules and Prices go too\. Products stay\./)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Delete Shop' })).toBeInTheDocument()
  })

  it('a plain User has neither the action nor the impact request', async () => {
    const api = setup({}, USER_ME)
    await pricesTile()
    expect(screen.queryByRole('button', { name: 'Delete Shop' })).toBeNull()
    expect(api.callsTo('GET', '/api/shops/4/impact')).toHaveLength(0)
  })
})

describe('Shop Barcodes: light removal with Undo, errors, and the add flow', () => {
  const barcodes = [{ id: 9, shopId: 4, productId: 7, code: 'PRIVATE-77' }]

  it('removing a Shop Barcode acts at once and offers Undo, which puts it back', async () => {
    const api = setup({
      'GET /api/shops/4/barcodes': barcodes,
      'DELETE /api/shop-barcodes/9': { status: 204 },
      'POST /api/shops/4/barcodes': { id: 10, shopId: 4, productId: 7, code: 'PRIVATE-77' },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Shop Barcode PRIVATE-77' }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/shop-barcodes/9')).toHaveLength(1))
    expect(screen.queryByRole('dialog')).toBeNull()
    const toast = await findToast('Shop Barcode PRIVATE-77 removed')
    expect(toast.querySelector('.toast__title svg')).toBeNull()
    await userEvent.click(within(toast).getByRole('button', { name: /^Undo/ }))
    await waitFor(() => expect(api.callsTo('POST', '/api/shops/4/barcodes')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/shops/4/barcodes')[0]!.body).toEqual({ productId: 7, code: 'PRIVATE-77' })
  })

  it('a failed removal is a FormError (role=alert), not a loose paragraph', async () => {
    setup({ 'GET /api/shops/4/barcodes': barcodes, 'DELETE /api/shop-barcodes/9': { status: 500, json: { error: { code: 'internal', message: 'The database is busy.' } } } })
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Shop Barcode PRIVATE-77' }))
    // renderWithProviders mounts an empty toast live region with role=alert; the screen's own alert is the FormError.
    const alert = (await screen.findByText('The database is busy.')).closest('[role="alert"]')
    expect(alert).toHaveClass('form-error')
    expect(document.querySelector('.pg__error')).toBeNull()
  })

  it('the sheet lists "Sold at Coop" first: a Product is sold there when the Shop has a Price or a Shop Barcode for it (the Product list carries no Shops)', async () => {
    setup({
      'GET /api/products': [
        { id: 6, name: 'Apple jam', ingredientId: 2, ingredientName: 'Jam', baseUnit: 'g', packSize: 300 },
        { id: 7, name: 'Mutti passata', ingredientId: 3, ingredientName: 'Tomato passata', baseUnit: 'g', packSize: 700 },
      ],
      'GET /api/shops/4/prices': [wire(7, 'Mutti passata')],
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Add Shop Barcode' }))
    await userEvent.click(await screen.findByRole('combobox', { name: 'Product' }))
    const options = await screen.findAllByRole('option')
    expect(options[0]).toHaveTextContent('Mutti passata')
    expect(screen.getByRole('listbox')).toHaveTextContent('Sold at Coop')
  })

  it('adding one ends with the toast "Shop Barcode added" and focus back on "Add Shop Barcode"', async () => {
    const api = setup({ 'POST /api/shops/4/barcodes': { id: 11, shopId: 4, productId: 7, code: 'PRIVATE-77' } })
    const add = await screen.findByRole('button', { name: 'Add Shop Barcode' })
    await userEvent.click(add)
    await userEvent.click(await screen.findByRole('combobox', { name: 'Product' }))
    await userEvent.click(await screen.findByRole('option', { name: /Mutti passata/ }))
    await userEvent.type(screen.getByLabelText('Code'), 'PRIVATE-77')
    await userEvent.click(screen.getByRole('button', { name: 'Save Shop Barcode' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/shops/4/barcodes')).toHaveLength(1))
    expect(await findToast('Shop Barcode added')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Shop Barcode' })).toHaveFocus())
  })
})
