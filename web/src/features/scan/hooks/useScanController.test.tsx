// SR3: the controller composes the Scanned session with the flow, the queue and the live list (functional spec §10.1).
// Everything outside the scan feature is mocked; the queue, the sync hook, the flow and the session are the real ones.
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { makeLine, makeList } from '../../shop/testData'
import { parse } from '../lib/barcode'
import { createMemoryOpStore, createMemoryPictureStore } from '../lib/queue'
import { createSessionStore } from '../lib/sessionStore'
import { createMemorySnapshotStore } from '../lib/snapshots'
import { okResult, passata, products } from '../lib/scannedList.testData'
import type { OfflineData, Op, ScanResult } from '../types'

const h = vi.hoisted(() => ({
  invalidate: vi.fn(),
  request: vi.fn(),
  toast: vi.fn(),
  list: undefined as unknown,
  api: {
    sync: vi.fn(),
    undo: vi.fn(),
    setPrice: vi.fn(),
    setPrices: vi.fn(),
    uploadPicture: vi.fn(),
    findArchived: vi.fn(),
    product: vi.fn(),
    unarchiveProduct: vi.fn(),
  },
  sessionDb: undefined as unknown,
}))

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: h.invalidate }) }))
vi.mock('../../shop/lib/liveRefresh', () => ({ liveRefreshFor: () => ({ request: h.request }) }))
vi.mock('../../shop/hooks/useShoppingList', () => ({ useShoppingList: () => ({ data: h.list }) }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../products/hooks/useCurrency', () => ({ useCurrency: () => 'USD' }))
vi.mock('../../stock/hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [], isLoading: false }) }))
vi.mock('../../stock/hooks/useStock', () => ({ useStockTotals: () => ({ data: [] }) }))
vi.mock('../../../ui/Toast', () => ({ useToast: () => ({ show: h.toast }) }))
vi.mock('../api', () => ({ scanApi: h.api }))
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
const offlineData: OfflineData = { shopId: 1, shopName: 'Coop', products, catalog: { globalBarcodes: { '08000500310427': 7 }, weightRules: [], weightProducts: {} } }
vi.mock('./useOfflineData', () => ({ useOfflineData: () => ({ offline: offlineData, status: 'ready', error: null }) }))
vi.mock('../lib/idbStore', async () => {
  const ops = createMemoryOpStore()
  const pictures = createMemoryPictureStore()
  return { appOpStore: () => ops, appPictureStore: () => pictures, appSnapshots: () => createMemorySnapshotStore() }
})
vi.mock('../lib/sessionStore', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/sessionStore')>()
  return { ...real, appSessionStore: () => real.createSessionStore(h.sessionDb as ReturnType<typeof createMemorySnapshotStore>) }
})

import { useScanController } from './useScanController'

const shop = { id: 1, name: 'Coop' }
const useIt = () => renderHook(() => useScanController({ mode: 'shop', shop }))
const read = (hook: ReturnType<typeof useIt>, code = '8000500310427') => act(async () => hook.result.current.flow.onScan(parse(code, 'ean_13')))
const echo = async (ops: Op[]): Promise<ScanResult[]> => ops.map((op) => okResult(op, passata, { onList: true, remaining: 700 }))

beforeEach(() => {
  vi.clearAllMocks()
  h.sessionDb = createMemorySnapshotStore()
  h.list = makeList({ today: '2026-11-13', lines: [makeLine({ ingredientId: 2, name: 'Passata', quantity: 700 }), makeLine({ ingredientId: 5, name: 'Cheese', quantity: 200 })], extras: [] })
  h.api.sync.mockImplementation(echo)
  h.api.setPrices.mockImplementation(async (b: { clientUuids: string[]; priceCents: number }) => b.clientUuids.map((u) => ({ clientUuid: u, status: 'applied', scan: { ...okResult({ clientUuid: u } as Op, passata).scan!, priceCents: b.priceCents } })))
  h.api.undo.mockResolvedValue({ undone: true })
})

describe('useScanController: the Scanned session', () => {
  it('exposes the Scanned list: a scan becomes a row with the server\'s match', async () => {
    const hook = useIt()
    await waitFor(() => expect(hook.result.current.scanned.loaded).toBe(true))
    await read(hook)
    await waitFor(() => expect(hook.result.current.scanned.rows).toHaveLength(1))
    expect(hook.result.current.scanned.rows[0]).toMatchObject({ key: '7', count: 1, onList: true, waiting: false })
  })

  it('exposes "To get": the open Lines of the Shopping List', async () => {
    const hook = useIt()
    await waitFor(() => expect(hook.result.current.scanned.toGetCount).toBe(2))
    expect(hook.result.current.scanned.toGet.map((l) => l.name)).toEqual(['Passata', 'Cheese'])
  })

  it('a scan made offline is a waiting row until the sync brings its Result', async () => {
    h.api.sync.mockRejectedValue(new ApiError(0, 'network', 'offline'))
    const hook = useIt()
    await waitFor(() => expect(hook.result.current.scanned.loaded).toBe(true))
    await read(hook)
    await waitFor(() => expect(hook.result.current.scanned.rows[0]?.waiting).toBe(true))
    h.api.sync.mockImplementation(echo)
    act(() => void window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(hook.result.current.scanned.rows[0]?.waiting).toBe(false))
  })

  it('the session comes back after a reload (same Shop and household day), and is empty the next day', async () => {
    const first = useIt()
    await waitFor(() => expect(first.result.current.scanned.loaded).toBe(true))
    await read(first)
    await waitFor(() => expect(first.result.current.scanned.rows).toHaveLength(1))
    await waitFor(async () => expect((await createSessionStore(h.sessionDb as never).load(1, '2026-11-13')).length).toBe(1))
    first.unmount()

    const reloaded = useIt()
    await waitFor(() => expect(reloaded.result.current.scanned.rows).toHaveLength(1))
    reloaded.unmount()

    h.list = makeList({ today: '2026-11-14', lines: [], extras: [] })
    const tomorrow = useIt()
    await waitFor(() => expect(tomorrow.result.current.scanned.loaded).toBe(true))
    expect(tomorrow.result.current.scanned.rows).toEqual([])
  })

  it('endSession (Change Shop) empties the list and the stored session', async () => {
    const hook = useIt()
    await waitFor(() => expect(hook.result.current.scanned.loaded).toBe(true))
    await read(hook)
    await waitFor(() => expect(hook.result.current.scanned.rows).toHaveLength(1))
    await act(async () => hook.result.current.endSession())
    expect(hook.result.current.scanned.rows).toEqual([])
    expect(await createSessionStore(h.sessionDb as never).load(1, '2026-11-13')).toEqual([])
  })

  it('Stock-take has no Scanned list and keeps nothing', async () => {
    const hook = renderHook(() => useScanController({ mode: 'stocktake', shop: null }))
    await waitFor(() => expect(hook.result.current.status).toBe('ready'))
    expect(hook.result.current.scanned.rows).toEqual([])
    await act(async () => hook.result.current.flow.onScan(parse('8000500310427', 'ean_13')))
    expect(hook.result.current.scanned.rows).toEqual([])
  })
})

describe('useScanController: group Price and Undo', () => {
  it('savePrice sends one PATCH /api/scan/prices for the row, sets the Prices and refreshes the live list', async () => {
    const hook = useIt()
    await waitFor(() => expect(hook.result.current.scanned.loaded).toBe(true))
    await read(hook)
    await read(hook)
    await waitFor(() => expect(hook.result.current.scanned.rows[0]?.count).toBe(2))
    h.request.mockClear()
    await act(async () => {
      await hook.result.current.flow.savePrice('7', { basis: 'pack', cents: 145, packCents: 145, perKgCents: null }, 'save')
    })
    expect(h.api.setPrices).toHaveBeenCalledTimes(1)
    expect(h.api.setPrices.mock.calls[0]![0]).toEqual({ clientUuids: expect.arrayContaining([expect.any(String), expect.any(String)]), priceCents: 145 })
    expect(h.api.setPrices.mock.calls[0]![0].clientUuids).toHaveLength(2)
    expect(hook.result.current.scanned.rows[0]).toMatchObject({ priceCents: 145, totalCents: 290 })
    expect(h.request).toHaveBeenCalled()
  })

  it('a Price set on a waiting row edits the queue: the server is not asked', async () => {
    h.api.sync.mockRejectedValue(new ApiError(0, 'network', 'offline'))
    const hook = useIt()
    await waitFor(() => expect(hook.result.current.scanned.loaded).toBe(true))
    await read(hook)
    await waitFor(() => expect(hook.result.current.scanned.rows[0]?.waiting).toBe(true))
    await act(async () => {
      await hook.result.current.flow.savePrice('7', { basis: 'pack', cents: 145, packCents: 145, perKgCents: null }, 'save')
    })
    expect(h.api.setPrices).not.toHaveBeenCalled()
    expect(hook.result.current.scanned.rows[0]).toMatchObject({ priceCents: 145, needsPrice: false })
    // the queued Op carries the new Price when it is finally sent
    h.api.sync.mockImplementation(echo)
    act(() => void window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(h.api.sync).toHaveBeenCalledTimes(2))
    expect(h.api.sync.mock.calls[1]![0][0].priceCents).toBe(145)
  })

  it('Remove of a row undoes the scan on the server and refreshes the live list', async () => {
    const hook = useIt()
    await waitFor(() => expect(hook.result.current.scanned.loaded).toBe(true))
    await read(hook)
    await waitFor(() => expect(hook.result.current.scanned.rows).toHaveLength(1))
    h.request.mockClear()
    await act(async () => hook.result.current.flow.removeRow('7'))
    expect(h.api.undo).toHaveBeenCalledTimes(1)
    expect(hook.result.current.scanned.rows).toEqual([])
    expect(h.request).toHaveBeenCalled()
  })

  it('toasts reach the Toast host with their action', async () => {
    const hook = useIt()
    await waitFor(() => expect(hook.result.current.scanned.loaded).toBe(true))
    await read(hook)
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Added Mutti passata 700 g', expect.objectContaining({ status: 'success', actionLabel: 'Undo', durationMs: 5000 })))
  })
})
