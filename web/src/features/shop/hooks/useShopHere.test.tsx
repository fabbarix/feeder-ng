// Shop Location on the Shop screen: the Shop the User is standing in becomes the Shop the list is priced at.
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import { clearGeo, fakeGeo } from '../../shops/testGeo'
import { useShopHere } from './useShopHere'

afterEach(() => {
  vi.unstubAllGlobals()
  clearGeo()
})

const shops = [
  { id: 1, name: 'Coop', location: { lat: 45.4642, lon: 9.19 } },
  { id: 2, name: 'Aldi', location: { lat: 45.5, lon: 9.25 } },
  { id: 3, name: 'Market', location: null },
]
const atCoop = { lat: 45.4643, lon: 9.1901, accuracy: 15 }
const atHome = { lat: 45.0, lon: 9.0, accuracy: 15 }

function Probe({ shopId, setShopId, onAddHere }: { shopId: number | null; setShopId: (id: number | null) => void; onAddHere: () => void }) {
  const here = useShopHere({ shopId, setShopId, onAddHere })
  return (
    <button type="button" onClick={here.find} data-status={here.status} data-any={String(here.anyLocated)}>
      find
    </button>
  )
}

function setup(shopId: number | null) {
  mockApi({ 'GET /api/shops': shops })
  const setShopId = vi.fn()
  const onAddHere = vi.fn()
  renderWithProviders(<Probe shopId={shopId} setShopId={setShopId} onAddHere={onAddHere} />)
  return { setShopId, onAddHere }
}

describe('useShopHere', () => {
  it('where location is already allowed, prices the list at the Shop the User is in, with Undo', async () => {
    fakeGeo(atCoop, 'granted')
    const { setShopId } = setup(2)
    await waitFor(() => expect(setShopId).toHaveBeenCalledWith(1))
    expect(await screen.findByText(/Priced at Coop: you are 10 m away/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(setShopId).toHaveBeenLastCalledWith(2)
  })

  it('never asks for location by itself where it would prompt', async () => {
    const calls = fakeGeo(atCoop, 'prompt')
    const { setShopId } = setup(null)
    await waitFor(() => expect(screen.getByRole('button', { name: 'find' })).toHaveAttribute('data-any', 'true'))
    await act(async () => {})
    expect(calls.count).toBe(0)
    expect(setShopId).not.toHaveBeenCalled()
  })

  it('on a tap away from every saved Shop, says so and offers to add it', async () => {
    fakeGeo(atHome, 'prompt')
    const { setShopId, onAddHere } = setup(1)
    await userEvent.click(screen.getByRole('button', { name: 'find' }))
    expect(await screen.findByText('No saved Shop is near you')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add it' }))
    expect(onAddHere).toHaveBeenCalled()
    expect(setShopId).not.toHaveBeenCalled()
  })

  it('on a tap with location off, says so', async () => {
    fakeGeo({ code: 1 }, 'prompt')
    setup(1)
    await userEvent.click(screen.getByRole('button', { name: 'find' }))
    expect(await screen.findByText('Location is off for Feeder')).toBeInTheDocument()
  })
})
