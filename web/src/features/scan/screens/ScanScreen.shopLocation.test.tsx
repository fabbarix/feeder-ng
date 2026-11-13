// Shop Location on the Scan screen: the nearest saved Shop leads the picker, a session started with another Shop offers
// to switch, and any User adds the Shop they are in.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeExtra, makeLine, makeList } from '../../shop/testData'
import type { ScanController } from '../hooks/useScanController'
import type { ScanFlow } from '../hooks/useScanFlow'

const controllerHook = vi.hoisted(() => ({ useScanController: vi.fn() }))
// Receipt reading: the assistant's status is not this file's concern; off, so the footer row stays hidden.
vi.mock('../../import/hooks/useReadAvailability', () => ({ useReadAvailability: () => ({ loading: false, enabled: false, isAdmin: false, photos: false, settingsLink: false, statusFailed: false, retry: () => {} }) }))
vi.mock('../hooks/useScanController', () => controllerHook)
vi.mock('../../shops/hooks/useShops', () => ({
  useShops: () => ({ shops: [{ id: 1, name: 'Aldi', location: { lat: 1, lon: 1 } }, { id: 2, name: 'Coop' }], isLoading: false, error: null, add: vi.fn() }),
}))
const lastShop = vi.hoisted(() => ({ getLastShopId: vi.fn((): number | null => 2), setLastShopId: vi.fn(), LAST_SHOP_KEY: 'x' }))
vi.mock('../lib/lastShop', () => lastShop)
const near = vi.hoisted(() => ({ useNearestShop: vi.fn() }))
vi.mock('../../shops/hooks/useNearestShop', () => near)
const sheet = vi.hoisted(() => ({ added: null as null | ((shop: { id: number; name: string }) => void) }))
vi.mock('../../shops/components/AddShopSheet', () => ({
  AddShopSheet: ({ open, onAdded }: { open: boolean; onAdded: (shop: { id: number; name: string }) => void }) => {
    sheet.added = onAdded
    return open ? <p>Add Shop sheet</p> : null
  },
}))

import { ScanScreen } from './ScanScreen'

function flow(over: Partial<ScanFlow> = {}): ScanFlow {
  return {
    pricing: null, startPriceEntry: vi.fn(), closePriceEntry: vi.fn(), savePrice: vi.fn(async () => ({ status: 'saved' as const })), increment: vi.fn(), decrement: vi.fn(), removeRow: vi.fn(), confirmRemove: vi.fn(),
    banner: null,
    sheet: null,
    paused: false,
    onScan: vi.fn(),
    saveUnknown: vi.fn(),
    submitWeight: vi.fn(),
    stockTakeAction: vi.fn(),
    closeSheet: vi.fn(),
    applySyncResults: vi.fn(),
    unarchiveProduct: vi.fn(),
    unarchiving: false,
    createNewInstead: vi.fn(),
    ...over,
  }
}

function controller(over: Partial<ScanController> = {}): ScanController {
  return {
    status: 'ready',
    error: null,
    camera: { status: 'ready', videoRef: { current: null }, torchSupported: true, torchOn: false, toggleTorch: vi.fn() },
    recovery: { failure: null, manualOpen: false, openManual: vi.fn(), closeManual: vi.fn(), text: '', setText: vi.fn(), error: null, submit: vi.fn(() => true), retry: vi.fn() },
    muted: false,
    toggleMute: vi.fn(),
    canVibrate: true,
    scanned: { loaded: false, entries: [], rows: [], totals: { spentCents: 0, unpricedCount: 0 }, toGet: [], toGetCount: 0, nextUnpriced: () => null, record: vi.fn(), settle: vi.fn(), drop: vi.fn(), reprice: vi.fn(), update: vi.fn(), clear: vi.fn() }, endSession: vi.fn(), flow: flow(),
    list: makeList({ lines: [makeLine(), makeLine({ ingredientId: 4, name: 'rice', ticked: true, quantity: 0, pack: null, estimatedCostCents: null })], extras: [makeExtra()], progress: { ticked: 1, total: 3 } }),
    online: true,
    pendingCount: 0,
    rejectedCount: 0,
    dismissRejected: vi.fn(),
    notices: [],
    dismissNotice: vi.fn(),
    ingredients: [{ id: 1, name: 'passata', baseUnit: 'g' }],
    currency: 'USD',
    system: 'metric',
    ...over,
  }
}

const aldiHere = { shop: { id: 1, name: 'Aldi' }, metres: 42 }

function open(nearest: typeof aldiHere | null) {
  near.useNearestShop.mockReturnValue({ nearest, status: nearest ? 'ready' : 'idle', position: null, failure: null, anyLocated: true, locate: vi.fn() })
  controllerHook.useScanController.mockReturnValue(controller())
  return render(
    <MemoryRouter initialEntries={['/scan']}>
      <ScanScreen />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  controllerHook.useScanController.mockReset()
  lastShop.setLastShopId.mockClear()
  lastShop.getLastShopId.mockReturnValue(2)
})

describe('ScanScreen: Shop Location', () => {
  it('a session started with the last Shop offers to switch to the Shop the phone is at', async () => {
    open(aldiHere)
    expect(screen.getByRole('heading', { level: 1, name: 'Coop' })).toBeInTheDocument()
    expect(screen.getByText('You seem to be at Aldi (40 m).')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Switch to Aldi' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Aldi' })).toBeInTheDocument()
    expect(lastShop.setLastShopId).toHaveBeenCalledWith(expect.anything(), 1)
    expect(screen.queryByText(/You seem to be at/)).toBeNull()
  })

  it('says nothing when the phone is at the Shop already, or nowhere known', () => {
    lastShop.getLastShopId.mockReturnValue(1)
    const { unmount } = open(aldiHere)
    expect(screen.queryByText(/You seem to be at/)).toBeNull()
    unmount()
    open(null)
    expect(screen.queryByText(/You seem to be at/)).toBeNull()
  })

  it('the picker leads with the nearest Shop, and a Shop added there starts the session', async () => {
    lastShop.getLastShopId.mockReturnValue(null)
    open(aldiHere)
    expect(screen.getByText('You are here · 40 m')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Add the Shop I am in/ }))
    expect(screen.getByText('Add Shop sheet')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Aldi/ }))
    expect(screen.getByRole('heading', { level: 1, name: 'Aldi' })).toBeInTheDocument()
  })
})
