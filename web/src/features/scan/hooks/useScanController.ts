// Everything the Scan screen needs, composed from the smaller hooks: the Shop's offline data (cached on the device),
// the camera, the detector, the scanner loop, the offline queue and sync, the flow, the live Shopping List and the
// feedback. The screen only renders this view model.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { useCurrency } from '../../products/hooks/useCurrency'
import { useShoppingList } from '../../shop/hooks/useShoppingList'
import { liveRefreshFor } from '../../shop/lib/liveRefresh'
import type { ShoppingList } from '../../shop/types'
import { useToast } from '../../../ui/Toast'
import { useIngredientChoices } from '../../stock/hooks/useIngredientChoices'
import { useStockTotals } from '../../stock/hooks/useStock'
import type { UnitSystem } from '../../../lib/units'
import { scanApi } from '../api'
import { chooseDetector, type Detector } from '../lib/detector'
import { createFeedback, webAudioBeep } from '../lib/feedback'
import { appOpStore, appPictureStore } from '../lib/idbStore'
import { appSessionStore } from '../lib/sessionStore'
import { shouldRefreshOfflineData } from '../lib/offlineRefresh'
import { OfflineQueue, type SyncApi } from '../lib/queue'
import type { SyncNotice } from '../lib/notices'
import { createZxingDetector } from '../lib/zxingDetector'
import type { IngredientChoice } from '../lib/unknownForm'
import { scanStrings } from '../strings'
import type { Op, OfflineProduct, PricePatch, ScanResult } from '../types'
import { useOfflineData } from './useOfflineData'
import { useCamera, type CameraStatus } from './useCamera'
import { useCameraRecovery, type CameraRecovery } from './useCameraRecovery'
import { useScanFlow, type ScanFlow } from './useScanFlow'
import { useScanner } from './useScanner'
import { useScannedList, type ScannedList } from './useScannedList'
import { useSyncQueue } from './useSyncQueue'

export interface ScanControllerOptions {
  mode: 'shop' | 'stocktake'
  /** required in shop mode */
  shop: { id: number; name: string } | null
}

export interface ScanController {
  /** loading the offline data; error when it is neither online nor cached */
  status: 'loading' | 'ready' | 'error'
  error: string | null
  camera: {
    status: CameraStatus
    videoRef: RefObject<HTMLVideoElement | null>
    torchSupported: boolean
    torchOn: boolean
    toggleTorch: () => void
  }
  /** B4: what to offer when the camera fails (retry, type the barcode) */
  recovery: CameraRecovery
  muted: boolean
  toggleMute: () => void
  /** false on iOS: the beep is the only confirmation */
  canVibrate: boolean
  flow: ScanFlow
  /** SR3: the Scanned list of the Shop and household day (empty in Stock-take) */
  scanned: ScannedList
  /** SR3: Change Shop: empties the Scanned list and its stored session */
  endSession: () => void
  /** the live Shopping List of the Shop (shop mode); undefined in Stock-take */
  list: ShoppingList | undefined
  online: boolean
  pendingCount: number
  rejectedCount: number
  dismissRejected: () => void
  notices: SyncNotice[]
  dismissNotice: (clientUuid: string) => void
  ingredients: IngredientChoice[]
  currency: string
  system: UnitSystem
  /** the Stock total of an Ingredient in Base Units, for the Stock-take sheet */
  stockTotal?: (ingredientId: number) => number | undefined
  /** SR4: a Product of the cached offline data, by id (the Price entry's pack size and last Price) */
  product?: (id: number) => OfflineProduct | undefined
}

/** The Scan session's view model. Mounted only after a Shop or Stock-take was chosen. */
export function useScanController(options: ScanControllerOptions): ScanController {
  const { mode } = options
  const shopId = options.shop?.id ?? null
  const queryClient = useQueryClient()
  const toast = useToast()
  const offline = useOfflineData(shopId)
  const currency = useCurrency()
  const system = useDisplayUnitSystem()
  const ingredientChoices = useIngredientChoices()
  const totals = useStockTotals()
  const shopList = useShoppingList({ shopId })
  const camera = useCamera({ enabled: true })
  const sessionStore = useMemo(() => appSessionStore(), [])

  const [detector, setDetector] = useState<Detector | null>(null)
  useEffect(() => {
    let alive = true
    const BarcodeDetectorCtor = (globalThis as { BarcodeDetector?: Parameters<typeof chooseDetector>[0]['BarcodeDetector'] }).BarcodeDetector
    chooseDetector({ BarcodeDetector: BarcodeDetectorCtor, createZxing: createZxingDetector })
      .then((d) => {
        if (alive) setDetector(d)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const feedback = useMemo(
    () =>
      createFeedback({
        beep: webAudioBeep(),
        vibrate: typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' ? (ms: number) => navigator.vibrate(ms) : undefined,
        storage: typeof window === 'undefined' ? null : safeStorage(),
      }),
    [],
  )
  const [muted, setMuted] = useState(() => feedback.isMuted())

  const store = useMemo(() => appOpStore(), [])
  const queue = useMemo(() => new OfflineQueue(store, undefined, appPictureStore()), [store])
  const syncApi = useMemo<SyncApi>(() => ({ sync: (ops: Op[]) => scanApi.sync(ops), uploadPicture: (blob: Blob) => scanApi.uploadPicture(blob) }), [])
  const [notices, setNotices] = useState<SyncNotice[]>([])
  const resultsRef = useRef(new Map<string, ScanResult>())
  // The flow is created after the sync queue (it needs the queue's functions); the sync reaches it through this ref.
  const flowRef = useRef<ScanFlow | null>(null)
  const sync = useSyncQueue({
    queue,
    api: syncApi,
    // PPX: the phone had no room for the Picture of an offline scan: the scan is queued without it, and the User is told.
    onPictureNotStored: () => toast.show(scanStrings.pictureNotSaved, { status: 'info' }),
    onResults: (results, found) => {
      for (const r of results) resultsRef.current.set(r.clientUuid, r)
      flowRef.current?.applySyncResults(results)
      if (found.length > 0) setNotices((prev) => [...prev, ...found])
      // A Product created (or merged into one) by this batch: the cached offline data must learn its barcode.
      if (shouldRefreshOfflineData(results)) void queryClient.invalidateQueries({ queryKey: ['scan', 'offline'] })
      liveRefreshFor(queryClient).request()
      void queryClient.invalidateQueries({ queryKey: ['stock'] })
    },
  })

  /** Queues the Op (PPX: with the Blob of its offline Picture) and sends the queue; the Result of this Op, or null while it waits (offline). */
  const submit = async (op: Op, picture?: Blob): Promise<ScanResult | null> => {
    resultsRef.current.delete(op.clientUuid)
    await sync.enqueue(op, picture)
    return resultsRef.current.get(op.clientUuid) ?? null
  }

  // true: the server has nothing for the scan (drop it here); false: the server applied it, so Undo goes there.
  const cancelQueued = (clientUuid: string): Promise<boolean> => sync.cancel(clientUuid)

  const refreshLive = () => {
    liveRefreshFor(queryClient).request()
    void queryClient.invalidateQueries({ queryKey: ['stock'] })
  }

  /** R8: the Product is unarchived on the server; the Catalog and the offline data learn it at once. */
  const unarchive = async (productId: number): Promise<void> => {
    await scanApi.unarchiveProduct(productId)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['products'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog'] }),
      queryClient.invalidateQueries({ queryKey: ['scan', 'offline'] }),
    ])
  }

  // SR3: the Scanned list is the Shop's session (the day is the Shopping List's); Stock-take keeps none.
  const scanned = useScannedList({
    shopId: mode === 'shop' ? shopId : null,
    day: mode === 'shop' ? (shopList.data?.today ?? null) : null,
    store: sessionStore,
    offline: offline.offline,
    list: mode === 'shop' ? shopList.data : undefined,
    system,
  })

  const flow = useScanFlow({
    mode,
    shop: options.shop,
    offline: offline.offline,
    currency,
    system,
    rangeTo: mode === 'shop' ? shopList.data?.to : undefined,
    submit,
    cancelQueued,
    setQueuedPrice: (clientUuid, priceCents, pricePerKgCents) => sync.updateQueuedPrice(clientUuid, priceCents, pricePerKgCents),
    undo: async (clientUuid) => {
      await scanApi.undo(clientUuid)
      refreshLive()
    },
    setPrice: async (clientUuid, priceCents, pricePerKgCents) => {
      await scanApi.setPrice(clientUuid, priceCents, pricePerKgCents)
      refreshLive()
    },
    setPrices: async (body: PricePatch) => {
      const results = await scanApi.setPrices(body)
      refreshLive()
      return results
    },
    ...(mode === 'shop' ? { session: scanned } : {}),
    feedback,
    notify: (message, status, opts) => toast.show(message, { status, ...opts }),
    findArchived: (code, shopId) => scanApi.findArchived(code, shopId),
    fetchProduct: (id) => scanApi.product(id),
    unarchive,
  })
  flowRef.current = flow

  const source = useMemo(() => ({ frame: camera.frame }), [camera.frame])
  const onScan = useRef(flow.onScan)
  onScan.current = flow.onScan
  const scanner = useScanner({
    detector,
    source,
    enabled: !flow.paused && camera.status === 'ready' && offline.status === 'ready',
    onScan: (scanned) => void onScan.current(scanned),
  })

  const recovery = useCameraRecovery({ status: camera.status, retryCamera: camera.retry, onScan: (scanned) => void onScan.current(scanned) })

  return {
    recovery,
    status: offline.status,
    error: offline.error ?? scanner.error,
    camera: {
      status: camera.status,
      videoRef: camera.videoRef,
      torchSupported: camera.torchSupported,
      torchOn: camera.torchOn,
      toggleTorch: () => void camera.toggleTorch(),
    },
    muted,
    toggleMute: () => {
      feedback.setMuted(!muted)
      setMuted(!muted)
    },
    canVibrate: feedback.canVibrate,
    flow,
    scanned,
    endSession: () => scanned.clear(),
    list: mode === 'shop' ? shopList.data : undefined,
    online: sync.online,
    pendingCount: sync.pendingCount,
    rejectedCount: sync.rejectedCount,
    dismissRejected: () => void sync.dismissRejected(),
    notices,
    dismissNotice: (clientUuid) => setNotices((prev) => prev.filter((n) => n.clientUuid !== clientUuid)),
    ingredients: ingredientChoices.choices,
    currency,
    system,
    stockTotal: (ingredientId) => totals.data?.find((t) => t.ingredientId === ingredientId)?.total,
    product: (id) => offline.offline?.products.find((p) => p.id === id),
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
