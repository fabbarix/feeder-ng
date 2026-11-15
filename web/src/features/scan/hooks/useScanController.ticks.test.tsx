// B9-54 (RES-03): Scan shares the app's one queue (SyncQueueProvider), so a Tick the Shop queued is a waiting Op here too: the live list it shows (the
// To get tab) has the waiting Ticks applied, the count counts them, and a Scan it queues goes in the same batch, in the order made.
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeLine, makeList } from '../../shop/testData'
import { parse } from '../lib/barcode'
import { createMemoryOpStore, createMemoryPictureStore, OfflineQueue } from '../lib/queue'
import { SyncQueueProvider } from '../components/SyncQueueProvider'
import { createMemorySnapshotStore } from '../lib/snapshots'
import { okResult, passata, products } from '../lib/scannedList.testData'
import type { OfflineData, Op, ScanResult } from '../types'

const h = vi.hoisted(() => ({
  invalidate: vi.fn(),
  request: vi.fn(),
  toast: vi.fn(),
  release: vi.fn(),
  hold: vi.fn(),
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
  shopApi: { tick: vi.fn(), untick: vi.fn() },
  sessionDb: undefined as unknown,
}))

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: h.invalidate }) }))
vi.mock('../../shop/lib/liveRefresh', () => ({ liveRefreshFor: () => ({ request: h.request }) }))
vi.mock('../../shop/hooks/useShoppingList', () => ({ useShoppingList: () => ({ data: h.list }) }))
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: { displayName: 'Ana', householdTimeZone: 'UTC' } }) }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../products/hooks/useCurrency', () => ({ useCurrency: () => 'USD' }))
vi.mock('../../stock/hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [], isLoading: false }) }))
vi.mock('../../stock/hooks/useStock', () => ({ useStockTotals: () => ({ data: [] }) }))
vi.mock('../../../ui/Toast', () => ({ useToast: () => ({ show: h.toast, hold: h.hold }) }))
vi.mock('../api', () => ({ scanApi: h.api }))
vi.mock('../../shop/api', () => ({ shopApi: h.shopApi }))
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
import type { ReactNode } from 'react'

const shop = { id: 1, name: 'Coop' }
const tick = (uuid: string): Op => ({ clientUuid: uuid, scannedAt: '2026-11-13T09:00:00Z', kind: 'shop_tick', shopId: 1, ingredientId: 2, rangeTo: '2026-11-15', quantity: 700, covers: 700 })

function setup(online = false) {
  const queue = new OfflineQueue(createMemoryOpStore(), undefined, createMemoryPictureStore())
  const state = { online }
  const wrapper = ({ children }: { children?: ReactNode }) => (
    <SyncQueueProvider queue={queue} api={{ sync: (ops: Op[]) => h.api.sync(ops) }} isOnline={() => state.online}>
      {children}
    </SyncQueueProvider>
  )
  const hook = renderHook(() => useScanController({ mode: 'shop', shop }), { wrapper })
  return { queue, state, hook }
}
const echo = async (ops: Op[]): Promise<ScanResult[]> => ops.map((op) => okResult(op, passata, { onList: true, remaining: 700 }))

beforeEach(() => {
  vi.clearAllMocks()
  h.sessionDb = createMemorySnapshotStore()
  h.list = makeList({ today: '2026-11-13', to: '2026-11-15', lines: [makeLine({ ingredientId: 2, name: 'Passata', quantity: 700 }), makeLine({ ingredientId: 5, name: 'Cheese', quantity: 200 })], extras: [], progress: { ticked: 0, total: 2 } })
  h.api.sync.mockImplementation(echo)
})

describe('useScanController on the shared queue', () => {
  it('a Tick queued by the Shop is waiting here too: the count includes it, and the live list shows the Line ticked (waiting to sync)', async () => {
    const { hook, queue } = setup()
    await queue.enqueue(tick('t-1'))
    await act(async () => void (await hook.result.current.dismissRejected()))
    await waitFor(() => expect(hook.result.current.pendingCount).toBe(1))
    const passataLine = hook.result.current.list?.lines.find((l) => l.ingredientId === 2)
    expect(passataLine?.ticked).toBe(true)
    expect(passataLine?.tick?.additions[0]).toMatchObject({ clientUuid: 't-1', mine: true, syncedAt: null, quantity: 700, who: 'Ana' })
    expect(hook.result.current.list?.lines.find((l) => l.ingredientId === 5)?.ticked).toBe(false)
    expect(hook.result.current.list?.progress).toEqual({ ticked: 1, total: 2 })
  })

  it('a Scan queued here goes in one batch with the Shop\'s Tick, in the order made, when the phone is back online', async () => {
    const { hook, queue, state } = setup()
    await queue.enqueue(tick('t-1'))
    await waitFor(() => expect(hook.result.current.status).toBe('ready'))
    await act(async () => hook.result.current.flow.onScan(parse('8000500310427', 'ean_13')))
    state.online = true
    act(() => void window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(h.api.sync).toHaveBeenCalledTimes(1))
    const sent = h.api.sync.mock.calls[0]![0] as Op[]
    expect(sent.map((o) => o.kind)).toEqual(['shop_tick', 'shop_scan'])
  })

  it('a refused Tick does not become a Scan notice', async () => {
    h.api.sync.mockImplementation(async (ops: Op[]) => ops.map((o) => ({ clientUuid: o.clientUuid, status: 'rejected', error: { code: 'not_on_list', message: 'gone' } })))
    const { hook, queue } = setup(true)
    await queue.enqueue(tick('t-1'))
    await act(async () => void (await hook.result.current.dismissRejected()))
    await waitFor(() => expect(h.api.sync).toHaveBeenCalled())
    expect(hook.result.current.notices).toEqual([])
  })
})
