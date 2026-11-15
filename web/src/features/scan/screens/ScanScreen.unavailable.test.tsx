// B9-54 (RES-03): the Scan screen opened offline on a phone that never saved this Shop's barcodes shows LoadState (the shared "unknown is not
// empty" state), not a dead viewfinder: title "This Shop’s barcodes aren’t on this phone yet", text "Scans need them once. They’ll load as soon as
// the connection is back." It has no camera and no scan list while that is the case; when the data arrives (status ready) the screen is as before.
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeList } from '../../shop/testData'
import type { ScanController } from '../hooks/useScanController'
import { flowFake, scannedFake } from './scanScreen.testKit'

const controllerHook = vi.hoisted(() => ({ useScanController: vi.fn() }))
vi.mock('../../import/hooks/useReadAvailability', () => ({ useReadAvailability: () => ({ loading: false, enabled: false, isAdmin: false, photos: false, settingsLink: false, statusFailed: false, retry: () => {} }) }))
vi.mock('../hooks/useScanController', () => controllerHook)
vi.mock('../../shops/hooks/useShops', () => ({ useShops: () => ({ shops: [{ id: 2, name: 'Coop' }], isLoading: false, error: null, add: vi.fn() }) }))
vi.mock('../lib/lastShop', () => ({ getLastShopId: () => 2, setLastShopId: vi.fn(), LAST_SHOP_KEY: 'x' }))

import { ScanScreen } from './ScanScreen'

function controller(status: ScanController['status']): ScanController {
  return {
    status,
    error: null,
    camera: { status: 'ready', videoRef: { current: null }, torchSupported: false, torchOn: false, toggleTorch: vi.fn() },
    recovery: { failure: null, manualOpen: false, openManual: vi.fn(), closeManual: vi.fn(), text: '', setText: vi.fn(), error: null, submit: vi.fn(() => true), retry: vi.fn() },
    muted: false,
    toggleMute: vi.fn(),
    canVibrate: false,
    flow: flowFake(),
    scanned: scannedFake(),
    toGetTick: { tick: vi.fn(async () => {}), pendingKeys: new Set<string>() },
    endSession: vi.fn(),
    list: makeList(),
    online: false,
    pendingCount: 0,
    rejectedCount: 0,
    dismissRejected: vi.fn(),
    notices: [],
    dismissNotice: vi.fn(),
    ingredients: [],
    currency: 'USD',
    system: 'metric',
  } as unknown as ScanController
}
const show = (status: ScanController['status']) => {
  controllerHook.useScanController.mockReturnValue(controller(status))
  return render(
    <MemoryRouter>
      <ScanScreen />
    </MemoryRouter>,
  )
}
beforeEach(() => controllerHook.useScanController.mockReset())

describe('ScanScreen with no data on the phone', () => {
  it('unavailable: a LoadState says why and what happens next', () => {
    const { container } = show('unavailable')
    const state = container.querySelector('.load-state') as HTMLElement
    expect(state).not.toBeNull()
    expect(state).toHaveTextContent('This Shop’s barcodes aren’t on this phone yet')
    expect(state).toHaveTextContent('Scans need them once. They’ll load as soon as the connection is back.')
    expect(container.querySelector('.error-state, .empty-state')).toBeNull()
  })

  it('ready: no such state', () => {
    const { container } = show('ready')
    expect(container.querySelector('.load-state')).toBeNull()
    expect(screen.queryByText(/barcodes aren’t on this phone yet/)).toBeNull()
  })
})
