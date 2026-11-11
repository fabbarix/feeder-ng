// PP: the Scan screen shows the Product's Picture on the scan line, and offers the Picture field in the what-is-this sheet (upload mode online, raw mode offline: PPX).
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeList } from '../../shop/testData'
import type { ScanController } from '../hooks/useScanController'
import type { ScanFlow } from '../hooks/useScanFlow'
import { scanStrings } from '../strings'

const controllerHook = vi.hoisted(() => ({ useScanController: vi.fn() }))
vi.mock('../hooks/useScanController', () => controllerHook)
vi.mock('../../shops/hooks/useShops', () => ({ useShops: () => ({ shops: [{ id: 2, name: 'Coop' }], isLoading: false, error: null, add: vi.fn() }) }))
vi.mock('../lib/lastShop', () => ({ getLastShopId: vi.fn(() => 2), setLastShopId: vi.fn(), LAST_SHOP_KEY: 'x' }))
vi.mock('../../../ui', async (orig) => ({
  ...(await orig<object>()),
  ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker,
}))

import { ScanScreen } from './ScanScreen'

const flow = (over: Partial<ScanFlow> = {}): ScanFlow => ({
  feedback: null, banner: null, sheet: null, paused: false, onScan: vi.fn(), saveUnknown: vi.fn(), submitWeight: vi.fn(), stockTakeAction: vi.fn(),
  openEditPrice: vi.fn(), editPrice: vi.fn(), undo: vi.fn(), dismissFeedback: vi.fn(), closeSheet: vi.fn(), applySyncResults: vi.fn(),
  unarchiveProduct: vi.fn(), unarchiving: false, createNewInstead: vi.fn(), ...over,
})
const controller = (over: Partial<ScanController> = {}): ScanController => ({
  status: 'ready', error: null,
  camera: { status: 'ready', videoRef: { current: null }, torchSupported: true, torchOn: false, toggleTorch: vi.fn() },
  recovery: { failure: null, manualOpen: false, openManual: vi.fn(), closeManual: vi.fn(), text: '', setText: vi.fn(), error: null, submit: vi.fn(() => true), retry: vi.fn() },
  muted: false, toggleMute: vi.fn(), canVibrate: true, flow: flow(), list: makeList({ lines: [], extras: [], progress: { ticked: 0, total: 0 } }),
  online: true, pendingCount: 0, rejectedCount: 0, dismissRejected: vi.fn(), notices: [], dismissNotice: vi.fn(),
  ingredients: [{ id: 1, name: 'passata', baseUnit: 'g' }], currency: 'USD', system: 'metric', ...over,
})
const open = (c: ScanController) => {
  controllerHook.useScanController.mockReturnValue(c)
  return render(<MemoryRouter initialEntries={['/scan']}><ScanScreen /></MemoryRouter>)
}
const line = { clientUuid: 'u-1', text: 'Passata +700 g · $1.59', queued: false, productName: 'Mutti passata 700 g', priceCents: 159, canEditPrice: true }
const unknown = { paused: true, sheet: { kind: 'unknown' as const, mode: 'pack' as const, target: { mode: 'pack' as const, code: '05012345678900' } } }

beforeEach(() => controllerHook.useScanController.mockReset())

describe('ScanScreen: Product pictures', () => {
  it('draws the picture of the scanned Product on the scan line', () => {
    open(controller({ flow: flow({ feedback: { ...line, imageUrl: '/api/images/' + 'a'.repeat(32) } }) }))
    expect(screen.getByText('Passata +700 g · $1.59').closest('[role=status]')!.querySelector('img')).toHaveAttribute('src', '/api/images/' + 'a'.repeat(32))
  })

  it('draws no picture for a Product without one', () => {
    open(controller({ flow: flow({ feedback: line }) }))
    expect(screen.getByText('Passata +700 g · $1.59').closest('[role=status]')!.querySelector('img')).toBeNull()
  })

  it('the what-is-this sheet has the Picture field while online', () => {
    open(controller({ flow: flow(unknown) }))
    expect(screen.getByRole('group', { name: scanStrings.pictureLabel })).toBeInTheDocument()
  })

  it('the field is the upload picker while online', () => {
    open(controller({ flow: flow(unknown) }))
    expect(screen.getByRole('group', { name: scanStrings.pictureLabel })).toHaveAttribute('data-mode', 'upload')
  })

  // PPX: no longer left out offline; the Blob is queued with the scan and uploaded on sync.
  it('and shows it in raw mode while offline', () => {
    open(controller({ online: false, flow: flow(unknown) }))
    expect(screen.getByRole('group', { name: scanStrings.pictureLabel })).toHaveAttribute('data-mode', 'raw')
  })
})
