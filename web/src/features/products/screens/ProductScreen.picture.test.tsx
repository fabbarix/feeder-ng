// PP: the Product page has a Picture Tile with the shared ImagePicker (4:3, like the Ingredient page); changes save at once through the hook.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PICKED_ID } from '../../../ui/ImagePicker/fake.test-helper'
import { CROP_ASPECTS } from '../../../ui/ImagePicker/lib/crop'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import { strings } from '../strings'
import type { ProductDetail } from '../types'
import { ProductScreen } from './ProductScreen'

vi.mock('../../../ui', async (orig) => ({
  ...(await orig<object>()),
  ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker,
}))

const settings = {
  timeZone: 'Europe/Rome', timeZoneConfigured: true, planningHorizonDays: 7, defaultCooldownDays: 7, defaultLeftoverUseByDays: 3,
  quietHours: { start: '22:00', end: '07:00' }, plannerStyle: 0.5, location: null, currency: 'USD',
}
const plain: ProductDetail = {
  id: 5, name: 'Passata 700 g', ingredientId: 3, ingredientName: 'tomato passata', baseUnit: 'g', packSize: 700, archived: false,
  image: '', imageUrl: '', barcodes: [], shops: [], shopBarcodes: [], latestPrices: [],
}
const withPicture: ProductDetail = { ...plain, image: PICKED_ID, imageUrl: `/api/images/${PICKED_ID}` }

function setup(initial: ProductDetail = plain, extra: Record<string, unknown> = {}) {
  let current = initial
  const api = mockApi({
    'GET /api/household/settings': settings,
    'GET /api/me/preferences': { scheme: 'system', accent: '#3f7d58', units: 'metric' },
    'GET /api/shops': [],
    'GET /api/products/5': () => current,
    'GET /api/products/5/prices': [],
    'PATCH /api/products/5': (call: { body?: { image?: string } }) => (current = { ...current, image: call.body?.image ?? current.image, imageUrl: call.body?.image ? `/api/images/${call.body.image}` : '' }),
    ...extra,
  })
  renderWithProviders(
    <Routes>
      <Route path="/products/:id" element={<ProductScreen />} />
    </Routes>,
    '/products/5',
  )
  return api
}
const picker = () => screen.getByRole('group', { name: strings.pictureLabel })

afterEach(() => vi.unstubAllGlobals())

describe('ProductScreen: Picture', () => {
  it('is a Tile of its own named Picture, with an h2 like the other Tiles, holding the shared ImagePicker with the landscape crop', async () => {
    setup()
    const tile = await screen.findByRole('region', { name: strings.pictureLabel })
    expect(within(tile).getByRole('heading', { level: 2, name: strings.pictureLabel })).toBeInTheDocument()
    expect(within(tile).getByRole('group', { name: strings.pictureLabel })).toBe(picker())
    expect(picker()).toHaveAttribute('data-mode', 'upload')
    expect(picker()).toHaveAttribute('data-aspect', String(CROP_ASPECTS.landscape))
    expect(picker()).toHaveAttribute('data-value', '')
  })

  it('comes first, before the Pack size Tile', async () => {
    setup()
    const tile = await screen.findByRole('region', { name: strings.pictureLabel })
    const pack = screen.getByRole('region', { name: strings.packSizeTitle })
    expect(tile.compareDocumentPosition(pack) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the current picture id to the picker', async () => {
    setup(withPicture)
    await screen.findByRole('region', { name: strings.pictureLabel })
    expect(picker()).toHaveAttribute('data-value', PICKED_ID)
  })

  it('saves a newly picked picture at once with a PATCH carrying only the image', async () => {
    const api = setup()
    await userEvent.click(await screen.findByRole('button', { name: `pick ${strings.pictureLabel}` }))
    await waitFor(() => expect(api.callsTo('PATCH', '/api/products/5')).toHaveLength(1))
    expect(api.callsTo('PATCH', '/api/products/5')[0]?.body).toEqual({ image: PICKED_ID })
    await waitFor(() => expect(picker()).toHaveAttribute('data-value', PICKED_ID))
  })

  it('removing the picture sends an empty image id', async () => {
    const api = setup(withPicture)
    await userEvent.click(await screen.findByRole('button', { name: `remove ${strings.pictureLabel}` }))
    await waitFor(() => expect(api.callsTo('PATCH', '/api/products/5')).toHaveLength(1))
    expect(api.callsTo('PATCH', '/api/products/5')[0]?.body).toEqual({ image: '' })
  })

  it('shows the server message in an alert when saving fails', async () => {
    setup(plain, { 'PATCH /api/products/5': { status: 400, json: { error: { code: 'invalid_product', message: 'image: The picture was not uploaded' } } } })
    await userEvent.click(await screen.findByRole('button', { name: `pick ${strings.pictureLabel}` }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('an archived Product can still change its picture', async () => {
    const api = setup({ ...plain, archived: true })
    await userEvent.click(await screen.findByRole('button', { name: `pick ${strings.pictureLabel}` }))
    await waitFor(() => expect(api.callsTo('PATCH', '/api/products/5')).toHaveLength(1))
  })
})
