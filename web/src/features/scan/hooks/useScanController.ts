// Everything the Scan screen needs, composed from the smaller hooks: the Shop's offline data (cached on the device),
// the camera, the detector, the scanner loop, the offline queue and sync, the flow, the live Shopping List and the
// feedback. The screen only renders this view model.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { useCurrency } from '../../products/hooks/useCurrency'
import { useShoppingList } from '../../shop/hooks/useShoppingList'
import type { ShoppingList } from '../../shop/types'
import { useIngredientChoices } from '../../stock/hooks/useIngredientChoices'
import { useStockTotals } from '../../stock/hooks/useStock'
import type { UnitSystem } from '../../../lib/units'
import { scanApi } from '../api'
import { chooseDetector, type Detector } from '../lib/detector'
import { createFeedback, webAudioBeep } from '../lib/feedback'
import { appOpStore } from '../lib/idbStore'
import { OfflineQueue, type SyncApi } from '../lib/queue'
import type { SyncNotice } from '../lib/notices'
import { createZxingDetector } from '../lib/zxingDetector'
import type { IngredientChoice } from '../lib/unknownForm'
import type { Op, ScanResult } from '../types'
import { useOfflineData } from './useOfflineData'
import { useCamera, type CameraStatus } from './useCamera'
import { useScanFlow, type ScanFlow } from './useScanFlow'
import { useScanner } from './useScanner'
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
  muted: boolean
  toggleMute: () => void
  /** false on iOS: the beep is the only confirmation */
  canVibrate: boolean
  flow: ScanFlow
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
}

/** The Scan session's view model. Mounted only after a Shop or Stock-take was chosen. */
export function useScanController(options: ScanControllerOptions): ScanController {
  const { mode } = options
  const shopId = options.shop?.id ?? null
  const queryClient = useQueryClient()
  const offline = useOfflineData(shopId)
  const currency = useCurrency()
  const system = useDisplayUnitSystem()
  const ingredientChoices = useIngredientChoices()
  const totals = useStockTotals()
  const shopList = useShoppingList({ shopId })
  const camera = useCamera({ enabled: true })

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
  const queue = useMemo(() => new OfflineQueue(store), [store])
  const syncApi = useMemo<SyncApi>(() => ({ sync: (ops: Op[]) => scanApi.sync(ops) }), [])
  const [notices, setNotices] = useState<SyncNotice[]>([])
  const resultsRef = useRef(new Map<string, ScanResult>())
  const sync = useSyncQueue({
    queue,
    api: syncApi,
    onResults: (results, found) => {
      for (const r of results) resultsRef.current.set(r.clientUuid, r)
      if (found.length > 0) setNotices((prev) => [...prev, ...found])
      void queryClient.invalidateQueries({ queryKey: ['shopping'] })
      void queryClient.invalidateQueries({ queryKey: ['stock'] })
    },
  })

  /** Queues the Op and sends the queue; the Result of this Op, or null while it waits (offline). */
  const submit = async (op: Op): Promise<ScanResult | null> => {
    resultsRef.current.delete(op.clientUuid)
    await sync.enqueue(op)
    return resultsRef.current.get(op.clientUuid) ?? null
  }

  const cancelQueued = async (clientUuid: string): Promise<boolean> => {
    const pending = await queue.pending()
    if (!pending.some((p) => p.op.clientUuid === clientUuid)) return false
    await store.remove(clientUuid)
    await sync.refresh()
    return true
  }

  const refreshLive = () => {
    void queryClient.invalidateQueries({ queryKey: ['shopping'] })
    void queryClient.invalidateQueries({ queryKey: ['stock'] })
  }

  const flow = useScanFlow({
    mode,
    shop: options.shop,
    offline: offline.offline,
    currency,
    system,
    rangeTo: mode === 'shop' ? shopList.data?.to : undefined,
    submit,
    cancelQueued,
    undo: async (clientUuid) => {
      await scanApi.undo(clientUuid)
      refreshLive()
    },
    setPrice: async (clientUuid, priceCents) => {
      await scanApi.setPrice(clientUuid, priceCents)
      refreshLive()
    },
    feedback,
  })

  const source = useMemo(() => ({ frame: camera.frame }), [camera.frame])
  const onScan = useRef(flow.onScan)
  onScan.current = flow.onScan
  const scanner = useScanner({
    detector,
    source,
    enabled: !flow.paused && camera.status === 'ready' && offline.status === 'ready',
    onScan: (scanned) => void onScan.current(scanned),
  })

  return {
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
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
