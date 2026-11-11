// Shop Location on /settings/shops/:id: any User standing in the Shop saves where it is.
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { USER_ME, mockApi, renderWithProviders } from '../../settings/test-utils'
import { ShopScreen } from '../screens/ShopScreen'
import { clearGeo, fakeGeo } from '../testGeo'

afterEach(() => {
  vi.unstubAllGlobals()
  clearGeo()
})

function setup(location: { lat: number; lon: number } | null) {
  const api = mockApi({
    'GET /api/me': USER_ME,
    'GET /api/shops': [{ id: 4, name: 'Coop', location }],
    'GET /api/shops/4/weight-rules': [],
    'GET /api/shops/4/barcodes': [],
    'GET /api/household/settings': { currency: 'USD' },
    'PUT /api/shops/4/location': (c: { body?: unknown }) => ({ json: { id: 4, name: 'Coop', location: c.body } }),
  })
  renderWithProviders(
    <Routes>
      <Route path="/settings/shops/:id" element={<ShopScreen />} />
    </Routes>,
    '/settings/shops/4',
  )
  return api
}

describe('ShopLocationTile', () => {
  it('a plain User saves the current location of a Shop that has none', async () => {
    fakeGeo({ lat: 45.4642, lon: 9.19, accuracy: 12 })
    const api = setup(null)
    expect(await screen.findByText(/Not saved yet/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save my current location' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/shops/4/location')).toHaveLength(1))
    expect(api.callsTo('PUT', '/api/shops/4/location')[0]?.body).toEqual({ lat: 45.4642, lon: 9.19 })
  })

  it('says when it is saved, and does not save a rough fix', async () => {
    fakeGeo({ lat: 45.4642, lon: 9.19, accuracy: 4000 })
    const api = setup({ lat: 1, lon: 2 })
    expect(await screen.findByText(/Saved: Feeder picks this Shop/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save my current location' }))
    expect(await screen.findByText(/too rough to save/)).toBeInTheDocument()
    expect(api.callsTo('PUT', '/api/shops/4/location')).toHaveLength(0)
  })
})
