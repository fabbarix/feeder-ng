// Shop Location: any User adds a Shop standing in it; the phone's position is offered as its Shop Location.
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import { clearGeo, fakeGeo } from '../testGeo'
import { AddShopSheet } from './AddShopSheet'

afterEach(() => {
  vi.unstubAllGlobals()
  clearGeo()
})

function setup(initialName = '') {
  const api = mockApi({ 'GET /api/shops': [], 'POST /api/shops': (c: { body?: unknown }) => ({ status: 201, json: { id: 9, ...(c.body as object), location: (c.body as { location?: unknown }).location ?? null } }) })
  const onAdded = vi.fn()
  renderWithProviders(<AddShopSheet open onClose={() => {}} initialName={initialName} onAdded={onAdded} />)
  return { api, onAdded }
}

describe('AddShopSheet', () => {
  it('locates on open and saves the spot with the Shop', async () => {
    fakeGeo({ lat: 45.4642, lon: 9.19, accuracy: 18 })
    const { api, onAdded } = setup('Coop')
    expect(await screen.findByText(/Found you, to within 20 m/)).toBeInTheDocument()
    const sw = screen.getByRole('switch', { name: 'Save this spot as the Shop’s location' })
    expect(sw).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Add Shop' }))
    await waitFor(() => expect(onAdded).toHaveBeenCalled())
    expect(api.callsTo('POST', '/api/shops')[0]?.body).toEqual({ name: 'Coop', location: { lat: 45.4642, lon: 9.19 } })
  })

  it('adds the Shop without a location when the User turns the switch off', async () => {
    fakeGeo({ lat: 45.4642, lon: 9.19, accuracy: 18 })
    const { api, onAdded } = setup('Coop')
    await screen.findByText(/Found you/)
    await userEvent.click(screen.getByRole('switch'))
    await userEvent.click(screen.getByRole('button', { name: 'Add Shop' }))
    await waitFor(() => expect(onAdded).toHaveBeenCalled())
    expect(api.callsTo('POST', '/api/shops')[0]?.body).toEqual({ name: 'Coop' })
  })

  it('says so and adds without a location when location is off', async () => {
    fakeGeo({ code: 1 })
    const { api, onAdded } = setup()
    expect(await screen.findByText(/Location is off for Feeder/)).toBeInTheDocument()
    expect(screen.getByRole('switch')).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox', { name: 'Shop name' }), 'Aldi')
    await userEvent.click(screen.getByRole('button', { name: 'Add Shop' }))
    await waitFor(() => expect(onAdded).toHaveBeenCalled())
    expect(api.callsTo('POST', '/api/shops')[0]?.body).toEqual({ name: 'Aldi' })
  })

  it('does not save a city-wide guess', async () => {
    fakeGeo({ lat: 45.4642, lon: 9.19, accuracy: 3000 })
    setup('Coop')
    expect(await screen.findByText(/too rough to save/)).toBeInTheDocument()
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })

  it('offers Try again when the phone could not tell', async () => {
    const calls = fakeGeo({ code: 3 })
    setup('Coop')
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(calls.count).toBe(2)
  })
})
