import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeExtra, makeLine, makeList } from '../../shop/testData'
import { scanSession } from '../hooks/useScanSessionActive'
import type { ScanController } from '../hooks/useScanController'
import type { ScanFlow } from '../hooks/useScanFlow'

const controllerHook = vi.hoisted(() => ({ useScanController: vi.fn() }))
vi.mock('../hooks/useScanController', () => controllerHook)
vi.mock('../../shops/hooks/useShops', () => ({
  useShops: () => ({ shops: [{ id: 1, name: 'Aldi' }, { id: 2, name: 'Coop' }], isLoading: false, error: null, add: vi.fn() }),
}))
const lastShop = vi.hoisted(() => ({ getLastShopId: vi.fn(() => 2), setLastShopId: vi.fn(), LAST_SHOP_KEY: 'x' }))
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
    ...over,
  }
}

function controller(over: Partial<ScanController> = {}): ScanController {
  return {
    status: 'ready',
    error: null,
    camera: { status: 'ready', videoRef: { current: null }, torchSupported: true, torchOn: false, toggleTorch: vi.fn() },
    muted: false,
    toggleMute: vi.fn(),
    canVibrate: true,
    flow: flow(),
    list: makeList({ lines: [makeLine(), makeLine({ ingredientId: 4, name: 'rice', ticked: true, quantity: 0, pack: null, estimatedCostCents: null })], extras: [makeExtra()], progress: { ticked: 1, total: 3 } }),
    online: true,
    pendingCount: 0,
    notices: [],
    dismissNotice: vi.fn(),
    ingredients: [{ id: 1, name: 'passata', baseUnit: 'g' }],
    currency: 'USD',
    system: 'metric',
    ...over,
  }
}

function open(c: ScanController) {
  controllerHook.useScanController.mockReturnValue(c)
  return render(<ScanScreen />)
}

async function startShopping(c = controller()) {
  const view = open(c)
  await userEvent.click(screen.getByRole('button', { name: 'Coop (last used)' }))
  return view
}

beforeEach(() => {
  controllerHook.useScanController.mockReset()
  lastShop.setLastShopId.mockClear()
})

describe('ScanScreen', () => {
  it('starts by asking where you are shopping, with the last Shop first', () => {
    open(controller())
    expect(screen.getByText('Where are you shopping?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Coop (last used)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stock-take at home' })).toBeInTheDocument()
  })

  it('picking a Shop remembers it, shows the viewfinder strip above the live list and marks a session active', async () => {
    await startShopping()
    expect(lastShop.setLastShopId).toHaveBeenCalledWith(expect.anything(), 2)
    expect(controllerHook.useScanController).toHaveBeenLastCalledWith({ mode: 'shop', shop: { id: 2, name: 'Coop' } })
    const strip = screen.getByRole('region', { name: 'Scanner' })
    const list = screen.getByRole('list', { name: 'Shopping List' })
    expect(strip.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(scanSession.isActive()).toBe(true)
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
    const view = open(controller({ list: undefined }))
    await userEvent.click(screen.getByRole('button', { name: 'Stock-take at home' }))
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
    open(controller({ flow: f, list: undefined }))
    await userEvent.click(screen.getByRole('button', { name: 'Stock-take at home' }))
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

  it('toggles the beep mute', async () => {
    const c = controller()
    await startShopping(c)
    await userEvent.click(screen.getByRole('button', { name: 'Mute beep' }))
    expect(c.toggleMute).toHaveBeenCalledTimes(1)
  })

  it('changing the Shop goes back to the picker', async () => {
    await startShopping()
    await userEvent.click(screen.getByRole('button', { name: 'Change Shop' }))
    expect(screen.getByText('Where are you shopping?')).toBeInTheDocument()
  })
})
