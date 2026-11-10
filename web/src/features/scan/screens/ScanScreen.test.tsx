import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeExtra, makeLine, makeList } from '../../shop/testData'
import { scanSession } from '../hooks/useScanSessionActive'
import type { ScanController } from '../hooks/useScanController'
import type { ScanFlow } from '../hooks/useScanFlow'

const controllerHook = vi.hoisted(() => ({ useScanController: vi.fn() }))
vi.mock('../hooks/useScanController', () => controllerHook)
const shopsState = vi.hoisted(() => ({ loading: false }))
vi.mock('../../shops/hooks/useShops', () => ({
  useShops: () => ({ shops: shopsState.loading ? [] : [{ id: 1, name: 'Aldi' }, { id: 2, name: 'Coop' }], isLoading: shopsState.loading, error: null, add: vi.fn() }),
}))
const lastShop = vi.hoisted(() => ({ getLastShopId: vi.fn((): number | null => 2), setLastShopId: vi.fn(), LAST_SHOP_KEY: 'x' }))
vi.mock('../lib/lastShop', () => lastShop)

import { ScanScreen } from './ScanScreen'

function flow(over: Partial<ScanFlow> = {}): ScanFlow {
  return {
    feedback: null,
    banner: null,
    sheet: null,
    paused: false,
    onScan: vi.fn(),
    saveUnknown: vi.fn(),
    submitWeight: vi.fn(),
    stockTakeAction: vi.fn(),
    openEditPrice: vi.fn(),
    editPrice: vi.fn(),
    undo: vi.fn(),
    dismissFeedback: vi.fn(),
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
    flow: flow(),
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

/** Stands in for a link elsewhere in the app: a client-side navigation while ScanScreen stays mounted. */
function Go({ to }: { to: string }) {
  const navigate = useNavigate()
  return <button onClick={() => navigate(to)}>go {to}</button>
}

function open(c: ScanController, entry = '/scan') {
  controllerHook.useScanController.mockReturnValue(c)
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Go to="/scan?mode=stocktake" />
      <ScanScreen />
    </MemoryRouter>,
  )
}

/** QA: with a last-used Shop the picker is skipped, the session starts at once. */
async function startShopping(c = controller()) {
  return open(c)
}

/** With no last-used Shop the picker asks; "Coop" is then chosen by hand. */
async function pickCoop(c = controller()) {
  lastShop.getLastShopId.mockReturnValue(null)
  const view = open(c)
  await userEvent.click(screen.getByRole('button', { name: 'Coop' }))
  return view
}

beforeEach(() => {
  controllerHook.useScanController.mockReset()
  lastShop.setLastShopId.mockClear()
  lastShop.getLastShopId.mockReturnValue(2)
  shopsState.loading = false
})

describe('ScanScreen', () => {
  it('QA: a last-used Shop skips the picker and starts the session, under a header naming the Shop', async () => {
    await startShopping()
    expect(screen.queryByText('Where are you shopping?')).toBeNull()
    expect(controllerHook.useScanController).toHaveBeenLastCalledWith({ mode: 'shop', shop: { id: 2, name: 'Coop' } })
    expect(screen.getByRole('heading', { level: 1, name: 'Coop' })).toBeInTheDocument()
    expect(scanSession.isActive()).toBe(true)
  })

  it('without a last-used Shop it asks where you are shopping, Stock-take at home last', () => {
    lastShop.getLastShopId.mockReturnValue(null)
    open(controller())
    expect(screen.getByRole('heading', { name: 'Where are you shopping?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aldi' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Stock-take at home/ })).toBeInTheDocument()
  })

  it('a last-used Shop that was deleted asks as well', () => {
    lastShop.getLastShopId.mockReturnValue(99)
    open(controller())
    expect(screen.getByRole('heading', { name: 'Where are you shopping?' })).toBeInTheDocument()
  })

  it('picking a Shop remembers it, shows the viewfinder strip above the live list and marks a session active', async () => {
    await pickCoop()
    expect(lastShop.setLastShopId).toHaveBeenCalledWith(expect.anything(), 2)
    expect(controllerHook.useScanController).toHaveBeenLastCalledWith({ mode: 'shop', shop: { id: 2, name: 'Coop' } })
    const strip = screen.getByRole('region', { name: 'Scanner' })
    const list = screen.getByRole('list', { name: 'Shopping List' })
    expect(strip.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(scanSession.isActive()).toBe(true)
  })

  it('shows how many scans the server rejected, with a way to dismiss them', async () => {
    const c = controller({ rejectedCount: 2 })
    await startShopping(c)
    expect(screen.getByText("2 scans couldn't sync")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(c.dismissRejected).toHaveBeenCalledTimes(1)
  })

  it('says nothing about rejected scans when there are none', async () => {
    await startShopping(controller({ rejectedCount: 0 }))
    expect(screen.queryByText(/couldn't sync/)).toBeNull()
  })

  it('the live list shows what is left, compactly', async () => {
    await startShopping()
    const list = screen.getByRole('list', { name: 'Shopping List' })
    expect(within(list).getByText(/Passata/)).toBeInTheDocument()
    expect(within(list).getByText(/1400 g · 2 × Mutti 700 g/)).toBeInTheDocument()
    expect(within(list).getByText(/toilet paper/)).toBeInTheDocument()
    expect(screen.getByText('2 left')).toBeInTheDocument()
  })

  it('Stock-take has the camera but no list and no session', async () => {
    lastShop.getLastShopId.mockReturnValue(null)
    const view = open(controller({ list: undefined }))
    await userEvent.click(screen.getByRole('button', { name: /Stock-take at home/ }))
    expect(controllerHook.useScanController).toHaveBeenLastCalledWith({ mode: 'stocktake', shop: null })
    expect(screen.getByRole('region', { name: 'Scanner' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Shopping List' })).toBeNull()
    expect(scanSession.isActive()).toBe(false)
    view.unmount()
  })

  it('the session ends when the screen goes away', async () => {
    const view = await startShopping()
    expect(scanSession.isActive()).toBe(true)
    view.unmount()
    expect(scanSession.isActive()).toBe(false)
  })

  it('shows the line after a scan with Edit price and Undo wired to the flow', async () => {
    const f = flow({ feedback: { clientUuid: 'u-1', text: 'Passata +700 g · $1.59', queued: false, productName: 'Mutti passata 700 g', priceCents: 159, canEditPrice: true } })
    await startShopping(controller({ flow: f }))
    expect(screen.getByText('Passata +700 g · $1.59')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit price' }))
    expect(f.undo).toHaveBeenCalledTimes(1)
    expect(f.openEditPrice).toHaveBeenCalledTimes(1)
  })

  it('shows a banner such as "Not a product code"', async () => {
    await startShopping(controller({ flow: flow({ banner: { tone: 'info', text: 'Not a product code' } }) }))
    expect(screen.getByText('Not a product code')).toBeInTheDocument()
  })

  it('opens the unknown-barcode sheet for an unknown scan', async () => {
    const f = flow({ paused: true, sheet: { kind: 'unknown', mode: 'pack', target: { mode: 'pack', code: '05012345678900' } } })
    await startShopping(controller({ flow: f }))
    expect(screen.getByRole('dialog', { name: 'What is this?' })).toBeInTheDocument()
  })

  it('opens the Stock-take sheet', async () => {
    const f = flow({
      paused: true,
      sheet: { kind: 'stock_take', product: { id: 7, name: 'Mutti passata 700 g', ingredientId: 2, ingredientName: 'Passata', baseUnit: 'g', packSize: 700, lastPriceCents: 159 } },
    })
    lastShop.getLastShopId.mockReturnValue(null)
    open(controller({ flow: f, list: undefined }))
    await userEvent.click(screen.getByRole('button', { name: /Stock-take at home/ }))
    expect(screen.getByRole('dialog', { name: 'Stock-take: Mutti passata 700 g' })).toBeInTheDocument()
  })

  it('opens the price editor and the ask-weight sheet', async () => {
    const edit = flow({ paused: true, sheet: { kind: 'edit_price' }, feedback: { clientUuid: 'u-1', text: 'x', queued: false, productName: 'Mutti passata 700 g', priceCents: 159, canEditPrice: true } })
    const view = await startShopping(controller({ flow: edit }))
    expect(screen.getByRole('dialog', { name: 'Price of Mutti passata 700 g' })).toBeInTheDocument()
    view.unmount()
    const ask = flow({
      paused: true,
      sheet: { kind: 'ask_weight', plan: { kind: 'ask_weight', priceCents: 250, product: { id: 21, name: 'Loose cheese', ingredientId: 5, ingredientName: 'cheese', baseUnit: 'g', packSize: 1000, lastPriceCents: null } } },
    })
    await startShopping(controller({ flow: ask }))
    expect(screen.getByRole('dialog', { name: 'How much does it weigh?' })).toBeInTheDocument()
  })

  it('says when the phone is offline and how many scans wait', async () => {
    await startShopping(controller({ online: false, pendingCount: 2 }))
    expect(screen.getByText('Offline: scans are kept and sent when you are back online')).toBeInTheDocument()
    expect(screen.getByText('2 scans waiting to sync')).toBeInTheDocument()
  })

  it('shows sync notices and lets the User dismiss them', async () => {
    const c = controller({ notices: [{ kind: 'merged', clientUuid: 'q-2', text: 'Someone already added this barcode; yours was merged into Tomatoes' }] })
    await startShopping(c)
    expect(screen.getByText(/merged into Tomatoes/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(c.dismissNotice).toHaveBeenCalledWith('q-2')
  })

  it('explains a blocked or missing camera', async () => {
    const c = controller()
    c.camera.status = 'denied'
    await startShopping(c)
    expect(screen.getByText('The camera is blocked. Allow it in the browser settings to scan.')).toBeInTheDocument()
  })

  it('B4: a failed camera offers a retry and typing the barcode, wired to the recovery', async () => {
    const recovery = { ...controller().recovery, failure: { status: 'denied' as const, canRetry: true, message: 'The camera is blocked. Allow it in the browser settings to scan.' } }
    await startShopping(controller({ camera: { ...controller().camera, status: 'denied' }, recovery }))
    await userEvent.click(screen.getByRole('button', { name: 'Try the camera again' }))
    expect(recovery.retry).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Type the barcode instead' }))
    expect(recovery.openManual).toHaveBeenCalled()
  })

  it('B4: a working camera shows no retry or manual entry', async () => {
    await startShopping()
    expect(screen.queryByRole('button', { name: 'Type the barcode instead' })).toBeNull()
  })

  it('toggles the beep mute', async () => {
    const c = controller()
    await startShopping(c)
    await userEvent.click(screen.getByRole('button', { name: 'Mute beep' }))
    expect(c.toggleMute).toHaveBeenCalledTimes(1)
  })

  it('changing the Shop goes back to the picker, even with a last-used Shop', async () => {
    await startShopping()
    await userEvent.click(screen.getByRole('button', { name: 'Change Shop' }))
    expect(screen.getByRole('heading', { name: 'Where are you shopping?' })).toBeInTheDocument()
    expect(scanSession.isActive()).toBe(false)
  })

  it('QA: Stock-take has a heading and a Back button that returns to the picker', async () => {
    lastShop.getLastShopId.mockReturnValue(null)
    open(controller({ list: undefined }))
    await userEvent.click(screen.getByRole('button', { name: /Stock-take at home/ }))
    expect(screen.getByRole('heading', { level: 1, name: 'Stock-take at home' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { name: 'Where are you shopping?' })).toBeInTheDocument()
  })

  it('B4: the typed-barcode form appears with the recovery state wired to it', async () => {
    const base = controller()
    const recovery = { ...base.recovery, failure: { status: 'denied' as const, canRetry: true, message: 'The camera is blocked. Allow it in the browser settings to scan.' }, manualOpen: true, text: '8000500310427' }
    await startShopping(controller({ camera: { ...base.camera, status: 'denied' }, recovery }))
    expect(screen.getByRole('textbox', { name: 'Barcode' })).toHaveValue('8000500310427')
    await userEvent.click(screen.getByRole('button', { name: 'Use this barcode' }))
    expect(recovery.submit).toHaveBeenCalled()
  })

  it('R8: an Archived Product that owns the barcode opens the unarchive offer, wired to the flow', async () => {
    const product = { id: 9, name: 'Old passata 500 g', ingredientId: 2, ingredientName: 'Passata', baseUnit: 'g' as const, packSize: 500, archived: true }
    const f = flow({ paused: true, sheet: { kind: 'unarchive', product, target: { mode: 'pack', code: '05012345678900' } } })
    await startShopping(controller({ flow: f }))
    expect(screen.getByRole('dialog', { name: 'Unarchive Old passata 500 g?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Unarchive Old passata 500 g' }))
    expect(f.unarchiveProduct).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Create a new Product instead' }))
    expect(f.createNewInstead).toHaveBeenCalledTimes(1)
  })

  it('?mode=stocktake (the Stock-take button of the Shopping List) skips the Shop picker into Stock-take', () => {
    lastShop.getLastShopId.mockReturnValue(2)
    open(controller({ list: undefined }), '/scan?mode=stocktake')
    expect(controllerHook.useScanController).toHaveBeenLastCalledWith({ mode: 'stocktake', shop: null })
    expect(screen.queryByRole('heading', { name: 'Where are you shopping?' })).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Stock-take at home' })).toBeInTheDocument()
    expect(scanSession.isActive()).toBe(false)
  })

  it('?mode=stocktake applied by a client-side navigation while the screen is mounted (useSearchParams)', async () => {
    lastShop.getLastShopId.mockReturnValue(null)
    open(controller({ list: undefined }))
    expect(screen.getByRole('heading', { name: 'Where are you shopping?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'go /scan?mode=stocktake' }))
    expect(screen.queryByRole('heading', { name: 'Where are you shopping?' })).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Stock-take at home' })).toBeInTheDocument()
    expect(controllerHook.useScanController).toHaveBeenLastCalledWith({ mode: 'stocktake', shop: null })
  })

  it('the Unarchive sheet is busy while the flow is unarchiving', () => {
    open(controller({ flow: flow({ unarchiving: true, sheet: { kind: 'unarchive', product: { id: 9, name: 'Old passata 500 g', ingredientId: 2, ingredientName: 'Passata', baseUnit: 'g', packSize: 500, archived: true }, target: { mode: 'pack', code: '05012345678900' } } }) }))
    expect(screen.getByRole('button', { name: 'Create a new Product instead' })).toBeDisabled()
  })

  it('shows a Skeleton while the Shops load, neither the picker (which would flash) nor a session', async () => {
    shopsState.loading = true
    open(controller())
    expect(await screen.findByText('Loading')).toBeInTheDocument()
    expect(screen.queryByText('Where are you shopping?')).toBeNull()
    expect(controllerHook.useScanController).not.toHaveBeenCalled()
  })
})
