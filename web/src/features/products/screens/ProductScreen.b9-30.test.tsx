// B9-30 (SET-04, SET-13, SAFE-02): the Product page.
// API pinned:
//   Order, by use: header (name; subtitle "<Ingredient link> · 700 g pack"; an outline ⋮ "More for <Product>" with Archive Product and
//   Delete Product, Delete in the danger tone), Prices, Sold at + Pack size (two-up cards, no span="full"), Barcodes, Picture (last, compact).
//   Only Prices, Barcodes and Picture are span="full". There is no actions tile.
//   Prices: subhead "Latest at each Shop"; one R-E ListRow per latest Price (priceRows): the Shop as title, the price in the value
//     column with the price per kg under it, the date as meta; a row is a button (aria-haspopup="dialog") named "<Shop>, <price>, <date>"
//     that opens the Price sheet, which holds "Delete Price"; the outline disclosure "Price history · N older" (aria-expanded, aria-controls)
//     only when there are older Prices, listing them newest first without repeating a latest row; an outline "Add Price" after them.
//   Pack size: the field and the primary "Save pack size" in one FieldRow (align end); Save disabled until the value changes; then the hint
//     "Was 700 g; per-kg Prices update on Save."
//   Barcodes: removable Chips; Shop Barcodes as R-E rows (key = the code or item code, state = the Shop, detail = "Weight Barcode Rule 21 ·
//     item code 00123" or "The Shop's own label"); "None yet. Add one on a Shop's page." when there are none.
//   Light removals act at once and show a one-line toast with Undo: "Price at Big Mart removed" (Undo records it again), "Passata 700 g
//     archived" (Undo unarchives). Delete Product keeps its danger confirm.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { findToast } from '../../../test/notices'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import type { Price, ProductDetail } from '../types'
import { ProductScreen } from './ProductScreen'

vi.mock('../../../ui', async (orig) => ({
  ...(await orig<object>()),
  ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker,
}))

const settings = { currency: 'USD' }
const YEAR = new Date().getFullYear()
const price = (over: Partial<Price> & { id: number }): Price => ({ productId: 5, shopId: 1, date: `${YEAR}-11-05`, priceCents: 159, pricePerKgCents: 227, pricePerKgDerived: false, ...over })
const latest = [price({ id: 10, shopId: 1, date: `${YEAR}-11-14`, priceCents: 159, pricePerKgCents: 227, pricePerKgDerived: true }), price({ id: 11, shopId: 2, date: `${YEAR}-11-10`, priceCents: 140, pricePerKgCents: null })]
const older = [price({ id: 12, shopId: 1, date: `${YEAR}-11-01`, priceCents: 150, pricePerKgCents: 214 }), price({ id: 13, shopId: 2, date: `${YEAR}-10-01`, priceCents: 135, pricePerKgCents: null })]
const base: ProductDetail = {
  id: 5, name: 'Passata 700 g', ingredientId: 3, ingredientName: 'tomato passata', baseUnit: 'g', packSize: 700, archived: false,
  barcodes: ['08001505005707', '04006381333931'],
  shops: [{ id: 1, name: 'Big Mart' }],
  shopBarcodes: [{ id: 1, shopId: 1, productId: 5, ruleId: 4, itemCode: '00123' }, { id: 2, shopId: 2, productId: 5, code: 'PRIVATE-77' }],
  latestPrices: latest,
}
const rule = { id: 4, shopId: 1, prefix: '21', item: { start: 3, length: 5 }, value: { start: 8, length: 5 }, valueKind: 'weight', valueUnit: 'kg', decimalPlaces: 3 }

function setup(initial: ProductDetail = base, extra: Record<string, unknown> = {}, allPrices: Price[] = [...latest, ...older]) {
  let current = initial
  const api = mockApi({
    'GET /api/household/settings': settings,
    'GET /api/me/preferences': { scheme: 'system', accent: '#3f7d58', units: 'metric' },
    'GET /api/shops': [{ id: 1, name: 'Big Mart' }, { id: 2, name: 'Coop' }],
    'GET /api/shops/1/weight-rules': [rule],
    'GET /api/products/5': () => current,
    'GET /api/products/5/prices': allPrices,
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
const region = async (name: string) => (await screen.findByRole('region', { name })) as HTMLElement

afterEach(() => vi.unstubAllGlobals())

describe('layout: order by use, two-up cards (SET-04, SET-13)', () => {
  it('the tiles run Prices, Sold at, Pack size, Barcodes, Picture', async () => {
    setup()
    await region('Prices')
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label') ?? document.getElementById(r.getAttribute('aria-labelledby') ?? '')?.textContent)).toEqual(['Prices', 'Sold at', 'Pack size', 'Barcodes', 'Picture'])
  })

  it('only Prices, Barcodes and Picture span the column; Sold at and Pack size are cards (two-up)', async () => {
    setup()
    for (const name of ['Prices', 'Barcodes', 'Picture']) expect((await region(name)).closest('[data-span]')?.getAttribute('data-span') ?? (await region(name)).getAttribute('data-span')).toBe('full')
    for (const name of ['Sold at', 'Pack size']) expect((await region(name)).getAttribute('data-span')).not.toBe('full')
  })

  it('has no Product actions tile; Archive and Delete are in the header menu', async () => {
    setup()
    await region('Prices')
    expect(screen.queryByRole('region', { name: 'Product actions' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Archive Product' })).toBeNull()
    const more = screen.getByRole('button', { name: 'More for Passata 700 g' })
    expect(more).toHaveAttribute('aria-haspopup', 'menu')
    expect(more.closest('.page-header__actions')).not.toBeNull()
    await userEvent.click(more)
    expect(screen.getByRole('menuitem', { name: 'Archive Product' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete Product' })).toHaveAttribute('data-tone', 'danger')
  })

  it('the subtitle is the Ingredient link and the pack size', async () => {
    setup()
    const link = await screen.findByRole('link', { name: 'Tomato passata' })
    expect(link).toHaveAttribute('href', '/ingredients/3')
    expect(link.closest('header, .page-header')).toHaveTextContent('700 g pack')
  })

  it('the Picture is last and compact', async () => {
    setup()
    const picture = await region('Picture')
    expect(within(picture).getByTestId('fake-image-picker')).toHaveAttribute('data-compact', 'true')
  })
})

describe('Prices as rows (SET-04)', () => {
  it('the latest Price at each Shop is a row with its price in the value column', async () => {
    setup()
    const tile = await region('Prices')
    expect(await within(tile).findByText('Latest at each Shop')).toBeInTheDocument()
    const row = within(tile).getByRole('button', { name: `Big Mart, $1.59, 14 Nov` })
    expect(row).toHaveAttribute('aria-haspopup', 'dialog')
    const li = row.closest('li')!
    expect(li.querySelector('.list-row__value')).toHaveTextContent('$1.59')
    expect(li.querySelector('.list-row__sub-value')).toHaveTextContent('$2.27 / kg')
    expect(li.querySelector('.list-row__meta')).toHaveTextContent('14 Nov · per kg from pack size')
    expect(li.textContent).not.toContain(`${YEAR}-11-14`)
  })

  it('a row opens the Price sheet, which deletes the Price at once with an Undo that records it again', async () => {
    const api = setup(base, { 'DELETE /api/prices/10': { status: 204 }, 'PUT /api/products/5/prices': price({ id: 20 }) })
    await userEvent.click(await screen.findByRole('button', { name: 'Big Mart, $1.59, 14 Nov' }))
    const sheet = await screen.findByRole('dialog', { name: /Big Mart/ })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete Price' }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/prices/10')).toHaveLength(1))
    expect(screen.queryByRole('dialog', { name: /Delete/ })).toBeNull()
    const toast = await findToast('Price at Big Mart removed')
    await userEvent.click(within(toast).getByRole('button', { name: /^Undo/ }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/products/5/prices')).toHaveLength(1))
    expect(api.callsTo('PUT', '/api/products/5/prices')[0]!.body).toEqual({ shopId: 1, date: `${YEAR}-11-14`, priceCents: 159 })
  })

  it('"Price history · 2 older" is an outline disclosure; it lists the older Prices newest first and never repeats a latest row', async () => {
    setup()
    const tile = await region('Prices')
    const button = await within(tile).findByRole('button', { name: 'Price history · 2 older' })
    expect(button).toHaveAttribute('data-variant', 'secondary')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveAttribute('aria-controls')
    expect(within(tile).queryByRole('button', { name: /Big Mart, \$1\.50/ })).toBeNull()
    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    const history = document.getElementById(button.getAttribute('aria-controls')!)!
    const names = within(history).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names).toEqual([`Big Mart, $1.50, 1 Nov`, `Coop, $1.35, 1 Oct`])
    expect(within(history).queryByRole('button', { name: /\$1\.59/ })).toBeNull()
  })

  it('has no history button when every Price is a latest one', async () => {
    setup(base, {}, latest)
    const tile = await region('Prices')
    await within(tile).findByRole('button', { name: 'Big Mart, $1.59, 14 Nov' })
    expect(within(tile).queryByRole('button', { name: /Price history/ })).toBeNull()
  })

  it('"Add Price" is an outline button after the rows and the history', async () => {
    setup()
    const tile = await region('Prices')
    const add = await within(tile).findByRole('button', { name: 'Add Price' })
    expect(add).toHaveAttribute('data-variant', 'secondary')
    const history = within(tile).getByRole('button', { name: 'Price history · 2 older' })
    expect(history.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('with no Price at all it says so, with no history button', async () => {
    setup({ ...base, latestPrices: [] }, {}, [])
    const tile = await region('Prices')
    expect(await within(tile).findByText('No Prices recorded')).toBeInTheDocument()
    expect(within(tile).queryByRole('button', { name: /Price history/ })).toBeNull()
  })
})

describe('Pack size beside its Save (SET-04)', () => {
  it('the field and "Save pack size" share one FieldRow; Save is the primary and is disabled until the value changes', async () => {
    setup()
    const tile = await region('Pack size')
    const field = within(tile).getByLabelText('Pack size (g)')
    const save = within(tile).getByRole('button', { name: 'Save pack size' })
    expect(field.closest('.field-row')).toBe(save.closest('.field-row'))
    expect(field.closest('.field-row')).not.toBeNull()
    expect(save).toHaveAttribute('data-variant', 'primary')
    expect(save).toBeDisabled()
    expect(within(tile).queryByText(/per-kg Prices update on Save/)).toBeNull()
  })

  it('a changed value shows "Was 700 g; per-kg Prices update on Save." and enables Save, which sends the PATCH', async () => {
    const api = setup(base, { 'PATCH /api/products/5': base })
    const tile = await region('Pack size')
    const field = within(tile).getByLabelText('Pack size (g)')
    await userEvent.clear(field)
    await userEvent.type(field, '750')
    expect(within(tile).getByText('Was 700 g; per-kg Prices update on Save.')).toBeInTheDocument()
    await userEvent.click(within(tile).getByRole('button', { name: 'Save pack size' }))
    await waitFor(() => expect(api.callsTo('PATCH', '/api/products/5')).toHaveLength(1))
    expect(api.callsTo('PATCH', '/api/products/5')[0]!.body).toEqual({ packSize: 750 })
  })

  it('an invalid value is the field\'s error', async () => {
    setup()
    const tile = await region('Pack size')
    const field = within(tile).getByLabelText('Pack size (g)')
    await userEvent.clear(field)
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(within(tile).getByText('Pack size must be a number above zero.')).toBeInTheDocument()
  })
})

describe('Shop Barcodes as rows (SET-04)', () => {
  it('a weighed code is a row with its item code as key, the Shop as state and the rule in the detail', async () => {
    setup()
    const tile = await region('Barcodes')
    const rows = await within(tile).findAllByRole('listitem')
    const weighed = rows.find((r) => r.textContent?.includes('00123'))!
    expect(weighed.querySelector('.detail-row__label')).toHaveTextContent('00123')
    expect(weighed.querySelector('.detail-row__state')).toHaveTextContent('Big Mart')
    expect(weighed.querySelector('.detail-row__detail')).toHaveTextContent('Weight Barcode Rule 21 · item code 00123')
    expect(tile.textContent).not.toMatch(/rule 4/i)
  })

  it('a plain Shop code shows the code, the Shop and "The Shop\'s own label"', async () => {
    setup()
    const tile = await region('Barcodes')
    const plain = (await within(tile).findAllByRole('listitem')).find((r) => r.textContent?.includes('PRIVATE-77'))!
    expect(plain.querySelector('.detail-row__state')).toHaveTextContent('Coop')
    expect(plain.querySelector('.detail-row__detail')).toHaveTextContent("The Shop's own label")
  })

  it('without any it says where to add one', async () => {
    setup({ ...base, shopBarcodes: [] })
    expect(await within(await region('Barcodes')).findByText("None yet. Add one on a Shop's page.")).toBeInTheDocument()
  })
})

describe('Archive acts at once, with Undo (SAFE-02)', () => {
  const archiveFromMenu = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'More for Passata 700 g' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archive Product' }))
  }

  it('Archive Product has no confirm: it archives, says "Passata 700 g archived" and offers Undo', async () => {
    const api = setup()
    await archiveFromMenu()
    await waitFor(() => expect(api.callsTo('POST', '/api/products/5/archive')).toHaveLength(1))
    expect(screen.queryByRole('dialog')).toBeNull()
    const toast = await findToast('Passata 700 g archived')
    expect(toast.querySelector('.toast__title svg')).toBeNull()
    await userEvent.click(within(toast).getByRole('button', { name: /^Undo/ }))
    await waitFor(() => expect(api.callsTo('POST', '/api/products/5/unarchive')).toHaveLength(1))
  })

  it('an archived Product offers Unarchive Product in the menu, at once', async () => {
    const api = setup({ ...base, archived: true })
    await userEvent.click(await screen.findByRole('button', { name: 'More for Passata 700 g' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Unarchive Product' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/products/5/unarchive')).toHaveLength(1))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Delete Product keeps its danger confirm (focus on Cancel, no Close) and only then deletes', async () => {
    const api = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'More for Passata 700 g' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete Product' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete Passata 700 g?' })
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(within(dialog).queryByRole('button', { name: /^close$/i })).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toHaveAttribute('data-variant', 'danger')
    expect(api.callsTo('DELETE', '/api/products/5')).toHaveLength(0)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/products/5')).toHaveLength(1))
    expect(await screen.findByText('Products list page')).toBeInTheDocument()
  })
})

describe('a failed change is a FormError (SAFE-04)', () => {
  it('shows the server message in role=alert .form-error, not a loose .pg__error', async () => {
    setup(base, { 'PATCH /api/products/5': { status: 400, json: { error: { code: 'invalid_product', message: 'The pack size is too large.' } } } })
    const tile = await region('Pack size')
    const field = within(tile).getByLabelText('Pack size (g)')
    await userEvent.clear(field)
    await userEvent.type(field, '99999999')
    await userEvent.click(within(tile).getByRole('button', { name: 'Save pack size' }))
    const alert = await screen.findByText('The pack size is too large.')
    expect(alert.closest('[role="alert"]')).toHaveClass('form-error')
    expect(document.querySelector('.pg__error')).toBeNull()
  })
})

describe('removing a barcode (SAFE-02): at once, then Undo', () => {
  it('says "Barcode 8 001505 005707 removed" with Undo, which adds the stored code again', async () => {
    const api = setup(base, { 'DELETE /api/products/5/barcodes/08001505005707': { status: 204 }, 'POST /api/products/5/barcodes': { status: 201, json: {} } })
    await userEvent.click(await screen.findByRole('button', { name: 'Remove barcode 8 001505 005707' }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/products/5/barcodes/08001505005707')).toHaveLength(1))
    expect(screen.queryByRole('dialog')).toBeNull()
    const toast = await findToast('Barcode 8 001505 005707 removed')
    await userEvent.click(within(toast).getByRole('button', { name: /^Undo/ }))
    await waitFor(() => expect(api.callsTo('POST', '/api/products/5/barcodes')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/products/5/barcodes')[0]!.body).toEqual({ code: '08001505005707' })
  })
})
