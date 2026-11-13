// R2-4: ScanScreen wires the near-duplicate lookup into the "what is this?" sheet only while online.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeList } from '../../shop/testData'
import type { ScanController } from '../hooks/useScanController'

const controllerHook = vi.hoisted(() => ({ useScanController: vi.fn() }))
vi.mock('../hooks/useScanController', () => controllerHook)
vi.mock('../../shops/hooks/useShops', () => ({ useShops: () => ({ shops: [{ id: 2, name: 'Coop' }], isLoading: false, error: null, add: vi.fn() }) }))
vi.mock('../lib/lastShop', () => ({ getLastShopId: () => 2, setLastShopId: vi.fn(), LAST_SHOP_KEY: 'x' }))
const search = vi.hoisted(() => vi.fn())
vi.mock('../../ingredients/api', () => ({ ingredientsApi: { search } }))

import { ScanScreen } from './ScanScreen'

function controller(online: boolean): ScanController {
  return {
    status: 'ready', error: null,
    camera: { status: 'ready', videoRef: { current: null }, torchSupported: false, torchOn: false, toggleTorch: vi.fn() },
    recovery: { failure: null, manualOpen: false, openManual: vi.fn(), closeManual: vi.fn(), text: '', setText: vi.fn(), error: null, submit: vi.fn(() => true), retry: vi.fn() },
    muted: false, toggleMute: vi.fn(), canVibrate: false,
    scanned: { loaded: false, entries: [], rows: [], totals: { spentCents: 0, unpricedCount: 0 }, toGet: [], toGetCount: 0, nextUnpriced: () => null, record: vi.fn(), settle: vi.fn(), drop: vi.fn(), reprice: vi.fn(), clear: vi.fn() }, endSession: vi.fn(),
    flow: {
      feedback: null, pricing: null, startPriceEntry: vi.fn(), closePriceEntry: vi.fn(), savePrice: vi.fn(async () => ({ status: 'saved' as const })), increment: vi.fn(), decrement: vi.fn(), removeRow: vi.fn(), confirmRemove: vi.fn(), banner: null, paused: true, onScan: vi.fn(), saveUnknown: vi.fn(), submitWeight: vi.fn(), stockTakeAction: vi.fn(), openEditPrice: vi.fn(),
      editPrice: vi.fn(), undo: vi.fn(), dismissFeedback: vi.fn(), closeSheet: vi.fn(), applySyncResults: vi.fn(), unarchiveProduct: vi.fn(), unarchiving: false,
      createNewInstead: vi.fn(), sheet: { kind: 'unknown', mode: 'pack', target: { mode: 'pack', code: '123' } },
    } as unknown as ScanController['flow'],
    list: makeList(), online, pendingCount: 0, rejectedCount: 0, dismissRejected: vi.fn(), notices: [], dismissNotice: vi.fn(),
    ingredients: [], currency: 'USD', system: 'metric',
  } as ScanController
}

async function createSumac(online: boolean) {
  controllerHook.useScanController.mockReturnValue(controller(online))
  render(<MemoryRouter><ScanScreen /></MemoryRouter>)
  await userEvent.click(screen.getByRole('combobox', { name: /Ingredient/ }))
  await userEvent.type(screen.getByRole('searchbox'), 'Sumac')
  await userEvent.click(screen.getByRole('option', { name: 'Create Ingredient "Sumac"' }))
}

beforeEach(() => {
  search.mockReset().mockResolvedValue({ exact: null, suggestions: [] })
})

describe('ScanScreen near-duplicate guard wiring', () => {
  it('online: a created Ingredient is looked up with the Ingredients search', async () => {
    await createSumac(true)
    expect(search).toHaveBeenCalledWith('Sumac')
  })
  it('offline: no lookup (Scans are queued; the Ingredient is created when the queue is sent)', async () => {
    await createSumac(false)
    expect(search).not.toHaveBeenCalled()
  })
})
