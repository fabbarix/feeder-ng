// B9-41 (SAFE-09): the controller's Undo toast for a Stock-take action reaches the Toast host as the shared Undo toast: the headline as its
// title, Undo named for the action, the 'undo' role, 5 s, no status icon; a refused Undo is the warning toast "Nothing was undone".
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { parse } from '../lib/barcode'
import { createMemoryOpStore, createMemoryPictureStore } from '../lib/queue'
import { createMemorySnapshotStore } from '../lib/snapshots'
import { okResult, passata, products } from '../lib/scannedList.testData'
import type { OfflineData, Op, ScanResult } from '../types'

const h = vi.hoisted(() => ({
  invalidate: vi.fn(),
  request: vi.fn(),
  toast: vi.fn(),
  hold: vi.fn(),
  api: { sync: vi.fn(), undo: vi.fn(), setPrice: vi.fn(), setPrices: vi.fn(), uploadPicture: vi.fn(), findArchived: vi.fn(), product: vi.fn(), unarchiveProduct: vi.fn() },
}))

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: h.invalidate }) }))
vi.mock('../../shop/lib/liveRefresh', () => ({ liveRefreshFor: () => ({ request: h.request }) }))
vi.mock('../../shop/hooks/useShoppingList', () => ({ useShoppingList: () => ({ data: undefined }) }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../products/hooks/useCurrency', () => ({ useCurrency: () => 'USD' }))
vi.mock('../../stock/hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [], isLoading: false }) }))
vi.mock('../../stock/hooks/useStock', () => ({ useStockTotals: () => ({ data: [] }) }))
vi.mock('../../../ui/Toast', () => ({ useToast: () => ({ show: h.toast, hold: h.hold }) }))
vi.mock('../api', () => ({ scanApi: h.api }))
vi.mock('../../shop/api', () => ({ shopApi: { tick: vi.fn(), untick: vi.fn() } }))
vi.mock('./useCamera', () => ({
  useCamera: () => ({ status: 'ready', videoRef: { current: null }, torchSupported: false, torchOn: false, toggleTorch: vi.fn(), frame: vi.fn(), retry: vi.fn() }),
}))
vi.mock('./useCameraRecovery', () => ({ useCameraRecovery: () => ({ failure: null }) }))
vi.mock('./useScanner', () => ({ useScanner: () => ({ error: null }) }))
vi.mock('../lib/detector', () => ({ chooseDetector: async () => ({}) }))
vi.mock('../lib/zxingDetector', () => ({ createZxingDetector: vi.fn() }))
vi.mock('../lib/feedback', () => ({
  webAudioBeep: () => vi.fn(),
  createFeedback: () => ({ confirm: vi.fn(), reject: vi.fn(), isMuted: () => false, setMuted: vi.fn(), canVibrate: false }),
}))
const offlineData: OfflineData = { shopId: null, shopName: '', products, catalog: { globalBarcodes: { '08000500310427': 7 }, weightRules: [], weightProducts: {} } }
vi.mock('./useOfflineData', () => ({ useOfflineData: () => ({ offline: offlineData, status: 'ready', error: null }) }))
vi.mock('../lib/idbStore', async () => {
  const ops = createMemoryOpStore()
  const pictures = createMemoryPictureStore()
  return { appOpStore: () => ops, appPictureStore: () => pictures, appSnapshots: () => createMemorySnapshotStore() }
})

import { useScanController } from './useScanController'

type ToastInput = { title: string; status?: string; subline?: string; sticky?: boolean; durationMs?: number; actions?: { label: string; ariaLabel?: string; role?: string; onClick: (ctx?: unknown) => void }[] }
const stockTaken = async (ops: Op[]): Promise<ScanResult[]> => ops.map((op) => okResult(op, passata, { total: 1400 }))

async function plusPack() {
  const hook = renderHook(() => useScanController({ mode: 'stocktake', shop: null }))
  await act(async () => hook.result.current.flow.onScan(parse('8000500310427', 'ean_13')))
  await waitFor(() => expect(hook.result.current.flow.sheet?.kind).toBe('stock_take'))
  await act(() => hook.result.current.flow.stockTakeAction('plus_pack'))
  const input = await waitFor(() => {
    const call = h.toast.mock.calls.map((c) => c[0] as ToastInput).find((t) => typeof t === 'object' && t.title.startsWith('+1 pack'))
    expect(call).toBeDefined()
    return call!
  })
  return { hook, input }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.api.sync.mockImplementation(stockTaken)
  h.api.undo.mockResolvedValue({ undone: true })
})

describe('useScanController: the Stock-take Undo toast', () => {
  it('"+1 pack of Passata: 1.4 kg in Stock": 5 s, no status icon, Undo (role undo) named "Undo +1 pack of Passata"', async () => {
    const { input } = await plusPack()
    expect(input).toMatchObject({ title: '+1 pack of Passata: 1.4 kg in Stock', durationMs: 5000 })
    expect(input.status).toBeUndefined()
    expect(input.actions).toEqual([expect.objectContaining({ label: 'Undo', role: 'undo', ariaLabel: 'Undo +1 pack of Passata' })])
  })

  it('Undo asks the server to undo that scan, once, and the live data is refreshed; nothing else is toasted', async () => {
    const { input } = await plusPack()
    const shown = h.toast.mock.calls.length
    await act(async () => input.actions![0]!.onClick({ focusWasInToast: false }))
    await waitFor(() => expect(h.api.undo).toHaveBeenCalledTimes(1))
    expect(h.api.undo).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]{36}$/))
    expect(h.request).toHaveBeenCalled()
    expect(h.toast.mock.calls).toHaveLength(shown)
  })

  it('a refused Undo is a warning toast "Nothing was undone" with the reason, sticky; never an error toast', async () => {
    h.api.undo.mockRejectedValue(new ApiError(409, 'not_undoable', 'not undoable'))
    const { input } = await plusPack()
    await act(async () => input.actions![0]!.onClick({ focusWasInToast: false }))
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ status: 'warning', title: 'Nothing was undone', subline: 'It cannot be undone.', sticky: true })))
    expect(h.toast.mock.calls.some((c) => (c[0] as ToastInput).status === 'error')).toBe(false)
  })
})
