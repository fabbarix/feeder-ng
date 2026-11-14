// Beta.8 (scan): the To get tab of the Scan screen ticks a Line by hand: a tap on the row hands the Line to the controller's
// toGetTick and stays on the Scan screen (it no longer opens /shop). The controller is a fake (scanScreen.testKit.tsx).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScanController } from '../hooks/useScanController'
import { controllerFake, scannedFake, sessionEntries } from './scanScreen.testKit'

const controllerHook = vi.hoisted(() => ({ useScanController: vi.fn() }))
vi.mock('../hooks/useScanController', () => controllerHook)
vi.mock('../../shops/hooks/useShops', () => ({ useShops: () => ({ shops: [{ id: 2, name: 'Coop' }], isLoading: false, error: null, add: vi.fn() }) }))
vi.mock('../lib/lastShop', () => ({ getLastShopId: () => 2, setLastShopId: vi.fn(), LAST_SHOP_KEY: 'x' }))
vi.mock('../../shops/hooks/useNearestShop', () => ({ useNearestShop: () => ({ nearest: null, status: 'idle', position: null, failure: null, anyLocated: true, locate: vi.fn() }) }))
vi.mock('../../import/hooks/useReadAvailability', () => ({
  useReadAvailability: () => ({ loading: false, enabled: false, isAdmin: false, photos: false, settingsLink: false, statusFailed: false, retry: () => {} }),
}))

import { ScanScreen } from './ScanScreen'

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.pathname}</p>
}
function open(c: ScanController) {
  controllerHook.useScanController.mockReturnValue(c)
  return render(
    <MemoryRouter initialEntries={['/scan']}>
      <ScanScreen />
      <Where />
    </MemoryRouter>,
  )
}
const toGet = () => screen.getByRole('list', { name: 'To get' })

beforeEach(() => {
  controllerHook.useScanController.mockReset()
  localStorage.clear()
  localStorage.setItem('feeder.scan.view', 'to-get')
})

describe('Scan screen: To get ticks by hand', () => {
  it('a tap on a To get row ticks that Line through the controller and stays on /scan', async () => {
    const c = controllerFake({ scanned: scannedFake(sessionEntries()) })
    open(c)
    await userEvent.click(within(toGet()).getByRole('button', { name: 'Tick Passata' }))
    expect(c.toGetTick.tick).toHaveBeenCalledTimes(1)
    expect(c.toGetTick.tick).toHaveBeenCalledWith(expect.objectContaining({ key: 'line:2', ingredientId: 2, title: 'Passata' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/scan')
  })

  it('shows each Line with the hollow tick and "x of y", and the rows pending in the controller as busy', () => {
    const c = controllerFake({ scanned: scannedFake(sessionEntries()), toGetTick: { tick: vi.fn(async () => {}), pendingKeys: new Set(['line:5']) } })
    open(c)
    const rows = within(toGet()).getAllByRole('listitem')
    expect(rows[0]!.querySelector('.list-row__meta')).toHaveTextContent(/of 1400 g/)
    expect(rows[1]).toHaveAttribute('aria-busy', 'true')
  })

  it('once every Line is ticked the tab says "Nothing left to get"', () => {
    const scanned = { ...scannedFake(sessionEntries()), toGet: [], toGetCount: 0 }
    open(controllerFake({ scanned }))
    expect(screen.getByText('Nothing left to get')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'To get 0' })).toBeChecked()
  })

  it('no row of this tab links to /shop', () => {
    open(controllerFake({ scanned: scannedFake(sessionEntries()) }))
    expect(toGet().querySelector('a[href="/shop"]')).toBeNull()
  })
})
