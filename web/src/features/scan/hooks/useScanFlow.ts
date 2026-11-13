// The scan flow: a read becomes a Shop scan, an unknown-barcode sheet, an ask-weight sheet or a Stock-take sheet,
// and the line shown afterwards with ✎ and Undo (functional spec §10.1, §10.2). React hook; every side effect is
// injected so tests use fakes.
import { useRef, useState } from 'react'
import { ApiError } from '../../../lib/http'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import type { Scanned } from '../lib/barcode'
import type { Feedback } from '../lib/feedback'
import { archivedOwnerId, type ArchivedProduct } from '../lib/archivedProduct'
import { planScan, applyAskedWeight, type ScanPlan } from '../lib/resolveScan'
import { stockTakeMessage } from '../lib/stockTakeToast'
import { feedbackText } from '../lib/toast'
import { toUnknownOp, validateUnknownForm, type UnknownFormValues, type UnknownMode, type UnknownTarget } from '../lib/unknownForm'
import { scanStrings } from '../strings'
import { entryPrice, planPriceEntry, type PriceEntry, type PriceIntent, type PriceLine } from '../lib/priceEntry'
import { buildScannedRows, displayOrder, nextWithoutPrice, repriceEntries, type PriceUpdate, type ScannedRow } from '../lib/scannedList'
import type { ScannedList } from './useScannedList'
import type { OfflineData, OfflineProduct, Op, PricePatch, ScanResult, StockTakeAction } from '../types'

/** SR3: the options of a Toast: an action (Undo, Put back) and how long it stays. */
export interface NotifyOptions {
  actionLabel?: string
  onAction?: () => unknown
  durationMs?: number
}

export interface ScanFlowDeps {
  mode: 'shop' | 'stocktake'
  /** required in shop mode */
  shop: { id: number; name: string } | null
  /** the cached offline data of the Shop (or home); scans are ignored until it is there */
  offline: OfflineData | null
  currency: string
  system: UnitSystem
  /** the Shopping List range the scans count against */
  rangeTo?: string
  /** online: applies the Op and returns its Result; offline: queues it and returns null */
  submit: (op: Op, picture?: Blob) => Promise<ScanResult | null>
  /** drops a still-queued Op (Undo while offline); false when it was already sent */
  cancelQueued: (clientUuid: string) => Promise<boolean>
  undo: (clientUuid: string) => Promise<void>
  setPrice: (clientUuid: string, priceCents: number, pricePerKgCents?: number) => Promise<void>
  /** B6: an edit of a still-queued scan: sync.updateQueuedPrice; true when the queue took it, false when it already left */
  setQueuedPrice?: (clientUuid: string, priceCents: number, pricePerKgCents?: number) => Promise<boolean>
  /** SR3: PATCH /api/scan/prices (scanApi.setPrices): one Price for the scans of a row; without it each scan is priced alone */
  setPrices?: (body: PricePatch) => Promise<ScanResult[]>
  /** SR3: the Scanned list of the Shop (useScannedList). Without it the flow behaves as before the list (Stock-take). */
  session?: ScannedList
  feedback: Pick<Feedback, 'confirm' | 'reject'>
  /**
   * WP7: a transient message (Toast). Stock-take outcomes (+1 pack, -1 pack, Set total, waiting to sync, rejected) go
   * here instead of the inline banner (QA: "-1 pack gives no toast"); lib/stockTakeToast.stockTakeMessage builds the text.
   */
  notify?: (message: string, status: 'success' | 'info' | 'error', opts?: NotifyOptions) => void
  /** R8, online only: scanApi.findArchived(code, shopId). A network error (ApiError 0) or a missing dep means "no archived owner known". */
  findArchived?: (barcode: string, shopId: number) => Promise<ArchivedProduct | null>
  /** R8: scanApi.product(id), for the owner named by a barcode_archived rejection */
  fetchProduct?: (id: number) => Promise<ArchivedProduct>
  /** R8: scanApi.unarchiveProduct(id) (the controller also refreshes ['products'], ['catalog'] and the offline data) */
  unarchive?: (productId: number) => Promise<void>
  /** R8, not an error path: the message of an unarchive that failed is shown through notify */
  newUuid?: () => string
  now?: () => Date
}

export type FlowSheet =
  | { kind: 'unknown'; mode: UnknownMode; target: UnknownTarget; priceText?: string }
  | { kind: 'ask_weight'; plan: Extract<ScanPlan, { kind: 'ask_weight' }> }
  | { kind: 'stock_take'; product: OfflineProduct }
  | { kind: 'edit_price' }
  /** R8: an Archived Product owns the barcode; offered before (or after a barcode_archived rejection of) a new Product */
  | { kind: 'unarchive'; product: ArchivedProduct; target: UnknownTarget }
  /** SR3: Remove of a row with two or more scans asks first */
  | { kind: 'confirm_remove'; key: string; name: string; count: number }

/** SR3: the Price entry is open on the row `key` (the camera is paused while it is). */
export interface PricingState {
  key: string
}

/** SR3: how a Price entry ended. `failed` and `refused` keep the entry open. */
export type PriceOutcome =
  | { status: 'saved' }
  | { status: 'discarded' }
  | { status: 'refused'; error: string }
  | { status: 'failed'; error: string }

export interface FlowFeedback {
  clientUuid: string
  /** feedbackText(...) */
  text: string
  /** the Op is in the offline queue */
  queued: boolean
  productName: string
  priceCents: number | null
  canEditPrice: boolean
  /** PP: the Product's Picture ("/api/images/<id>"), from the Result or, for a queued scan, the offline Product; absent when none */
  imageUrl?: string
}

export interface FlowBanner {
  tone: 'info' | 'warn'
  text: string
}

export interface ScanFlow {
  /** the last scan's line with ✎ and Undo, or null */
  feedback: FlowFeedback | null
  /** a short message such as "Not a product code" */
  banner: FlowBanner | null
  /** the open sheet, or null */
  sheet: FlowSheet | null
  /** true while a sheet or the Price entry is open: the scanner should not read */
  paused: boolean
  onScan(scanned: Scanned): Promise<void>
  saveUnknown(values: UnknownFormValues): Promise<void>
  submitWeight(grams: number): Promise<void>
  stockTakeAction(action: StockTakeAction, total?: number): Promise<void>
  /** B7: the Results of a sync flush; the line of a scan that was waiting follows its Result (synced, or gone) */
  applySyncResults(results: ScanResult[]): void
  openEditPrice(): void
  editPrice(priceCents: number): Promise<void>
  undo(): Promise<void>
  dismissFeedback(): void
  closeSheet(): void
  /**
   * R8: unarchive sheet -> deps.unarchive(product.id), then a shop_scan Op for it (productId, quantity = packSize, no
   * price) as if it had been known; the sheet closes and the scan line shows. A failure keeps the sheet and notifies an error.
   * For a weighed target no Op is made: it notifies "Unarchived <name>. Scan it again." (the Catalog changes on sync).
   */
  unarchiveProduct(): Promise<void>
  /** R8: true while unarchiveProduct runs (the sheet's primary Button is busy and a second tap is ignored) */
  unarchiving: boolean
  /** R8: "Create a new Product instead" -> the unknown sheet for the same target; a second barcode_archived is then a warn banner, not another prompt. */
  createNewInstead(): void
  /** SR3: the Price entry open on a row, or null */
  pricing: PricingState | null
  /** SR3: "+1 without a Price" (no key: the first row without a Price, from the top) or a row's Price pill */
  startPriceEntry(key?: string): void
  closePriceEntry(): void
  /** SR3: saves a Price for the row: one edit of the queued scans and one PATCH for the applied ones (13.4, 13.9) */
  savePrice(key: string, entry: PriceEntry, intent: PriceIntent): Promise<PriceOutcome>
  /** SR3: + on a row: a new shop_scan Op for its Product (not for a weighed row) */
  increment(key: string): Promise<void>
  /** SR3: − on a row: Undo of its latest scan; at ×1 it is Remove */
  decrement(key: string): Promise<void>
  /** SR3: Remove: ×1 at once with "Put back"; ×2 or more opens confirm_remove first */
  removeRow(key: string): Promise<void>
  /** SR3: the confirm_remove sheet's Remove: undoes every scan of the row, latest first */
  confirmRemove(): Promise<void>
}

/** The line of the last scan, as the flow keeps it (the text is derived when shown). */
interface Line {
  clientUuid: string
  ingredientName: string
  baseUnit: BaseUnit
  quantity: number
  priceCents: number | null
  onList: boolean
  queued: boolean
  productName: string
  imageUrl?: string
}

type BaseUnit = 'g' | 'ml' | 'piece'

interface Fallback {
  ingredientName: string
  baseUnit: BaseUnit
  quantity: number
  priceCents: number | null
  productName: string
  /** PP: the offline Product's Picture, used while the scan is queued */
  imageUrl?: string
}

const nowIso = (d: ScanFlowDeps) => (d.now ? d.now() : new Date()).toISOString()

/** The message of a failed call, for a toast. */
const failureText = (err: unknown) => (err instanceof Error ? err.message : scanStrings.unarchiveFailed)

/** SR3: a Toast action that runs at most once (a double tap on Undo or Put back does it once). */
function once(fn: () => unknown): () => unknown {
  let used = false
  return () => {
    if (used) return undefined
    used = true
    return fn()
  }
}

/** SR3: the server's PATCH /api/scan/prices, or the single-scan PATCH for each scan when the batch call is not wired. */
async function sendPrices(d: ScanFlowDeps, body: PricePatch): Promise<ScanResult[]> {
  if (d.setPrices) return d.setPrices(body)
  for (const clientUuid of body.clientUuids) await d.setPrice(clientUuid, body.priceCents, body.pricePerKgCents)
  return []
}

/**
 * Shop mode: planScan(scanned, offline). known -> build a shop_scan Op (new clientUuid, scannedAt = now, shopId,
 * rangeTo, productId, quantity, priceCents when known), call feedback.confirm(), submit, then show the feedback
 * line from the Result (price = result price, else the plan's; "not on the list" when result.onList is false; no
 * such words when queued). A rejected Result shows a warn banner with its message and feedback.reject(). unknown ->
 * sheet 'unknown' (mode 'pack'); unknown_weighed -> mode 'weighed' or 'weighed_price' (needsWeight); ask_weight ->
 * sheet 'ask_weight'; not_product -> banner "Not a product code"; invalid -> banner "Couldn't read that, try
 * again" and feedback.reject(). Stock-take mode: known -> sheet 'stock_take'; unknown -> banner "Unknown barcode: add
 * it by scanning in a Shop". Undo: cancelQueued when the Op is still queued, else undo(); either clears the feedback.
 */
export function useScanFlow(deps: ScanFlowDeps): ScanFlow {
  const depsRef = useRef(deps)
  depsRef.current = deps
  const [line, setLine] = useState<Line | null>(null)
  const [banner, setBanner] = useState<FlowBanner | null>(null)
  const [sheet, setSheet] = useState<FlowSheet | null>(null)
  // R8: after "Create a new Product instead" the same barcode is not offered the archived Product again (a second rejection warns).
  const offeredArchivedRef = useRef(false)
  // R8: an unarchive is under way (the ref guards a double tap; the state shows the sheet's busy Button).
  const unarchivePending = useRef(false)
  const [unarchiving, setUnarchiving] = useState(false)
  // SR3: the Price entry open on a row (null when closed).
  const [pricing, setPricing] = useState<PricingState | null>(null)
  // SR3: the scans whose Undo is under way.
  const undoing = useRef(new Set<string>())

  const text = (l: Pick<Line, 'ingredientName' | 'baseUnit' | 'quantity' | 'priceCents' | 'onList'>) =>
    feedbackText({ ingredientName: l.ingredientName, quantity: l.quantity, baseUnit: l.baseUnit, priceCents: l.priceCents, currency: depsRef.current.currency, onList: l.onList }, depsRef.current.system)

  /**
   * SR3: the Toast after a scan: "Added {product}" with Undo for 5 s. Undo fires once, and not at all when the scan
   * already left the list (−, Remove or a rejected sync took it).
   */
  const announceAdded = (productName: string, clientUuid: string) => {
    const undoOnce = once(async () => {
      if (!depsRef.current.session?.entries.some((e) => e.op.clientUuid === clientUuid)) return
      await undoScan(clientUuid)
    })
    depsRef.current.notify?.(scanStrings.added(productName), 'success', { actionLabel: scanStrings.undo, onAction: undoOnce, durationMs: 5000 })
  }

  /** Applies the Result of one Op (or the queueing when null) to the feedback line and the banner; with a Scanned list, to the list and the Toast. */
  const finish = async (op: Op, result: ScanResult | null, fallback: Fallback, productName: string) => {
    const d = depsRef.current
    const clientUuid = op.clientUuid
    if (result === null) {
      d.feedback.confirm()
      setBanner(null)
      if (d.session) {
        d.session.record(op, null)
        announceAdded(productName, clientUuid)
        return
      }
      setLine({ clientUuid, ingredientName: fallback.ingredientName, baseUnit: fallback.baseUnit, quantity: fallback.quantity, priceCents: fallback.priceCents, onList: true, queued: true, productName, ...(fallback.imageUrl ? { imageUrl: fallback.imageUrl } : {}) })
      return
    }
    if (result.status === 'rejected') {
      d.feedback.reject()
      setLine(null)
      setBanner({ tone: 'warn', text: scanStrings.rejectedAdd(result.error?.message ?? '') })
      return
    }
    d.feedback.confirm()
    setBanner(null)
    if (d.session) {
      d.session.record(op, result)
      announceAdded(productName, clientUuid)
      return
    }
    const s = result.scan
    // PE: the Product's Picture, else its Ingredient's.
    const picture = s ? s.productImageUrl || s.ingredientImageUrl : fallback.imageUrl
    setLine({
      clientUuid,
      ingredientName: s?.ingredientName ?? fallback.ingredientName,
      baseUnit: s?.baseUnit ?? fallback.baseUnit,
      quantity: s?.quantity ?? fallback.quantity,
      priceCents: s ? s.priceCents : fallback.priceCents,
      onList: s?.onList ?? true,
      queued: false,
      productName: s?.productName ?? productName,
      // The server is right: a Result without a picture shows none, whatever the cache had.
      ...(picture ? { imageUrl: picture } : {}),
    })
  }

  const newOpBase = (clientUuid: string, kind: Op['kind']): Op => {
    const d = depsRef.current
    const op: Op = { clientUuid, scannedAt: nowIso(d), kind }
    if (d.shop) op.shopId = d.shop.id
    if (d.rangeTo) op.rangeTo = d.rangeTo
    return op
  }

  const uuid = () => (depsRef.current.newUuid ?? (() => globalThis.crypto.randomUUID()))()

  const shopScan = async (plan: Extract<ScanPlan, { kind: 'known' }>) => {
    const d = depsRef.current
    const op: Op = { ...newOpBase(uuid(), 'shop_scan'), productId: plan.product.id, quantity: plan.quantity }
    if (plan.priceCents !== null) op.priceCents = plan.priceCents
    if (plan.pricePerKgCents !== undefined) op.pricePerKgCents = plan.pricePerKgCents
    if (plan.weighed) op.weighed = true
    const result = await d.submit(op)
    await finish(
      op,
      result,
      { ingredientName: plan.product.ingredientName, baseUnit: plan.product.baseUnit, quantity: plan.quantity, priceCents: plan.priceCents, productName: plan.product.name, imageUrl: plan.product.imageUrl || plan.product.ingredientImageUrl },
      plan.product.name,
    )
  }

  const openUnknown = (plan: Extract<ScanPlan, { kind: 'unknown' | 'unknown_weighed' }>) => {
    if (plan.kind === 'unknown') {
      setSheet({ kind: 'unknown', mode: 'pack', target: { mode: 'pack', code: plan.code } })
      return
    }
    if (plan.needsWeight) {
      setSheet({ kind: 'unknown', mode: 'weighed_price', target: { mode: 'weighed_price', ruleId: plan.ruleId, itemCode: plan.itemCode, priceCents: plan.priceCents ?? 0 } })
      return
    }
    const target: UnknownTarget = { mode: 'weighed', ruleId: plan.ruleId, itemCode: plan.itemCode, weightGrams: plan.weightGrams ?? 0 }
    if (plan.priceCents !== undefined) target.priceCents = plan.priceCents
    setSheet({ kind: 'unknown', mode: 'weighed', target })
  }

  /** R8: the Archived Product that owns `code` at this Shop, or null (also when the server cannot be reached: no offer). */
  const findArchivedOwner = async (code: string, shopId: number): Promise<ArchivedProduct | null> => {
    const find = depsRef.current.findArchived
    if (!find) return null
    try {
      return await find(code, shopId)
    } catch {
      return null
    }
  }

  const onScan = async (scanned: Scanned): Promise<void> => {
    const d = depsRef.current
    if (!d.offline) return
    const stockTake = d.mode === 'stocktake'
    setBanner(null)
    offeredArchivedRef.current = false
    const plan = planScan(scanned, d.offline)
    switch (plan.kind) {
      case 'known':
        if (stockTake) setSheet({ kind: 'stock_take', product: plan.product })
        else if (d.shop) await shopScan(plan)
        return
      case 'ask_weight':
        setSheet({ kind: 'ask_weight', plan })
        return
      case 'unknown':
      case 'unknown_weighed': {
        if (stockTake) {
          setBanner({ tone: 'info', text: scanStrings.unknownAtHome })
          return
        }
        const owner = plan.kind === 'unknown' && d.shop ? await findArchivedOwner(plan.code, d.shop.id) : null
        if (plan.kind === 'unknown' && owner) {
          setSheet({ kind: 'unarchive', product: owner, target: { mode: 'pack', code: plan.code } })
          return
        }
        openUnknown(plan)
        return
      }
      case 'not_product':
        setBanner({ tone: 'info', text: scanStrings.notProduct })
        return
      case 'invalid':
        d.feedback.reject()
        setBanner({ tone: 'warn', text: scanStrings.unreadable })
        return
    }
  }

  /** R8: a barcode_archived rejection opens the unarchive offer (or, after "Create a new Product instead", a warning). */
  const archivedRejection = async (ownerId: number, target: UnknownTarget): Promise<void> => {
    const d = depsRef.current
    const owner = await d.fetchProduct?.(ownerId).catch(() => null)
    if (!owner) {
      setBanner({ tone: 'warn', text: scanStrings.archivedOwner(`#${ownerId}`) })
      return
    }
    if (offeredArchivedRef.current) {
      setBanner({ tone: 'warn', text: scanStrings.archivedOwner(owner.name) })
      return
    }
    setBanner(null)
    setSheet({ kind: 'unarchive', product: owner, target })
  }

  const saveUnknown = async (values: UnknownFormValues): Promise<void> => {
    const d = depsRef.current
    if (!sheet || sheet.kind !== 'unknown' || !d.shop) return
    if (Object.keys(validateUnknownForm(values, sheet.mode)).length > 0) return
    const target = sheet.target
    const op = toUnknownOp(values, target, { clientUuid: uuid(), scannedAt: nowIso(d), shopId: d.shop.id, rangeTo: d.rangeTo })
    // PPX: a Picture picked offline travels with the Op as a Blob (the queue uploads it on sync). An uploaded id wins; a link is never queued.
    const blob = !op.productImage && values.picture?.kind === 'blob' ? values.picture.blob : undefined
    const result = blob ? await d.submit(op, blob) : await d.submit(op)
    setSheet(null)
    const ownerId = archivedOwnerId(result)
    if (ownerId !== null) {
      await archivedRejection(ownerId, target)
      return
    }
    await finish(
      op,
      result,
      {
        ingredientName: values.ingredient?.name ?? '',
        baseUnit: values.ingredient?.baseUnit ?? 'g',
        quantity: op.quantity ?? 0,
        priceCents: op.priceCents ?? null,
        productName: op.productName ?? '',
      },
      op.productName ?? '',
    )
  }

  const submitWeight = async (grams: number): Promise<void> => {
    const d = depsRef.current
    if (!sheet || sheet.kind !== 'ask_weight' || !d.shop) return
    let asked
    try {
      asked = applyAskedWeight(sheet.plan, grams)
    } catch {
      return
    }
    const plan = sheet.plan
    const op: Op = { ...newOpBase(uuid(), 'shop_scan'), productId: plan.product.id, quantity: asked.quantity, priceCents: asked.priceCents, pricePerKgCents: asked.pricePerKgCents }
    setSheet(null)
    const result = await d.submit(op)
    await finish(
      op,
      result,
      { ingredientName: plan.product.ingredientName, baseUnit: plan.product.baseUnit, quantity: asked.quantity, priceCents: asked.priceCents, productName: plan.product.name, imageUrl: plan.product.imageUrl || plan.product.ingredientImageUrl },
      plan.product.name,
    )
  }

  const stockTakeAction = async (action: StockTakeAction, total?: number): Promise<void> => {
    const d = depsRef.current
    if (!sheet || sheet.kind !== 'stock_take') return
    const op: Op = { clientUuid: uuid(), scannedAt: nowIso(d), kind: 'stock_take', productId: sheet.product.id, action }
    if (total !== undefined) op.total = total
    setSheet(null)
    const result = await d.submit(op)
    if (result === null) {
      d.notify?.(scanStrings.waitingToSync, 'info')
      return
    }
    if (result.status === 'rejected') {
      d.feedback.reject()
      d.notify?.(scanStrings.rejectedAdd(result.error?.message ?? ''), 'error')
      return
    }
    d.feedback.confirm()
    const s = result.scan
    if (s?.total !== undefined) {
      d.notify?.(stockTakeMessage(action, s.ingredientName, formatQuantity(s.total, s.baseUnit, d.system)), 'success')
    }
  }

  /**
   * R8: the unarchive sheet's primary action. A failure keeps the sheet and says why. A pack is then scanned as a known
   * Product (one pack, no price); a weighed target only says to scan it again (the Catalog changes on the next sync).
   */
  const unarchiveProduct = async (): Promise<void> => {
    // The ref is set before any await, so a second tap in the same frame is refused (the state only re-renders the sheet).
    if (unarchivePending.current || !sheet || sheet.kind !== 'unarchive') return
    const d = depsRef.current
    const { product, target } = sheet
    if (!d.unarchive) return
    unarchivePending.current = true
    setUnarchiving(true)
    try {
      try {
        await d.unarchive(product.id)
      } catch (err) {
        d.notify?.(failureText(err), 'error')
        return
      }
      setSheet(null)
      if (target.mode !== 'pack') {
        d.notify?.(scanStrings.unarchivedScanAgain(product.name), 'success')
        return
      }
      const op: Op = { ...newOpBase(uuid(), 'shop_scan'), productId: product.id, quantity: product.packSize }
      const result = await d.submit(op)
      await finish(
        op,
        result,
        { ingredientName: product.ingredientName, baseUnit: product.baseUnit, quantity: product.packSize, priceCents: null, productName: product.name },
        product.name,
      )
    } finally {
      unarchivePending.current = false
      setUnarchiving(false)
    }
  }

  /** R8: "Create a new Product instead" shows the unknown sheet for the same barcode. */
  const createNewInstead = (): void => {
    if (!sheet || sheet.kind !== 'unarchive') return
    offeredArchivedRef.current = true
    setSheet({ kind: 'unknown', mode: 'pack', target: sheet.target })
  }

  const openEditPrice = () => {
    if (line) setSheet({ kind: 'edit_price' })
  }

  /** B6: a still-queued scan is edited in the queue; once it left the queue (or was synced) the server edits it. */
  const editPrice = async (priceCents: number): Promise<void> => {
    if (!line) return
    const d = depsRef.current
    const editedQueued = line.queued && d.setQueuedPrice ? await d.setQueuedPrice(line.clientUuid, priceCents) : false
    if (!editedQueued) await d.setPrice(line.clientUuid, priceCents)
    // functional: the line may have changed while the awaits ran (a flush settled it, or it was undone)
    setLine((current) => (current?.clientUuid === line.clientUuid ? { ...current, priceCents } : current))
    setSheet(null)
  }

  /**
   * B7: the Result of a sync flush settles the line of a scan that was waiting: applied or duplicate take the
   * server's quantity, price and list state (no longer "waiting to sync"); rejected clears the line (the sync notice
   * explains it). Results for other scans, and a line that is not waiting, are left alone.
   */
  const applySyncResults = (results: ScanResult[]): void => {
    depsRef.current.session?.settle(results)
    setLine((current) => {
      if (!current || !current.queued) return current
      const result = results.find((r) => r.clientUuid === current.clientUuid)
      if (!result) return current
      if (result.status === 'rejected') return null
      const s = result.scan
      if (!s) return { ...current, queued: false }
      return { ...current, queued: false, ingredientName: s.ingredientName, baseUnit: s.baseUnit, quantity: s.quantity, priceCents: s.priceCents, onList: s.onList, productName: s.productName, imageUrl: s.productImageUrl || s.ingredientImageUrl }
    })
  }

  /** The server Undo; a 404 means the server never had the Op (not applied), which is as undone as it gets. */
  const serverUndo = async (clientUuid: string): Promise<void> => {
    try {
      await depsRef.current.undo(clientUuid)
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) throw err
    }
  }

  const undo = async (): Promise<void> => {
    if (!line) return
    const d = depsRef.current
    if (line.queued) {
      const removed = await d.cancelQueued(line.clientUuid)
      if (!removed) await serverUndo(line.clientUuid)
    } else {
      await serverUndo(line.clientUuid)
    }
    setLine(null)
  }

  // ---- SR3: the Scanned list ------------------------------------------------------------------------------------

  const findRow = (key: string): ScannedRow | undefined => depsRef.current.session?.rows.find((r) => r.key === key)

  /**
   * Undoes one scan: a queued one leaves the queue (the server undoes it when it already left); the list drops it.
   * False when the Undo failed (the Toast says why and the scan stays).
   */
  const undoScan = async (clientUuid: string): Promise<boolean> => {
    // A second Undo of the same scan while the first is under way (a double tap on −) does nothing.
    if (undoing.current.has(clientUuid)) return false
    undoing.current.add(clientUuid)
    try {
      return await undoScanNow(clientUuid)
    } finally {
      undoing.current.delete(clientUuid)
    }
  }

  const undoScanNow = async (clientUuid: string): Promise<boolean> => {
    const d = depsRef.current
    const entry = d.session?.entries.find((e) => e.op.clientUuid === clientUuid)
    try {
      if (entry && entry.result === null) {
        const removed = await d.cancelQueued(clientUuid)
        if (!removed) await serverUndo(clientUuid)
      } else {
        await serverUndo(clientUuid)
      }
    } catch (err) {
      d.notify?.(err instanceof Error ? err.message : scanStrings.undoFailed, 'error')
      return false
    }
    d.session?.drop([clientUuid])
    return true
  }

  /** Put back: a new shop_scan Op for the Product of a removed row, at its Price (and its weight, when weighed). */
  const putBack = async (row: ScannedRow): Promise<void> => {
    const d = depsRef.current
    const scan = row.scans[row.scans.length - 1]
    if (!d.shop || row.productId === null || !scan) return
    const product = d.offline?.products.find((p) => p.id === row.productId)
    const priceCents = row.priceCents ?? product?.lastPriceCents ?? null
    const op: Op = { ...newOpBase(uuid(), 'shop_scan'), productId: row.productId, quantity: scan.quantity }
    if (priceCents !== null) op.priceCents = priceCents
    if (scan.pricePerKgCents !== null) op.pricePerKgCents = scan.pricePerKgCents
    if (scan.weighed) op.weighed = true
    const result = await d.submit(op)
    await finish(
      op,
      result,
      { ingredientName: row.ingredientName, baseUnit: row.baseUnit, quantity: scan.quantity, priceCents, productName: row.name, ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}) },
      row.name,
    )
  }

  /** Remove of a row with one scan: at once, with "Removed {product}" and Put back. */
  const removeOne = async (row: ScannedRow): Promise<void> => {
    const scan = row.scans[0]
    if (!scan) return
    if (!(await undoScan(scan.clientUuid))) return
    depsRef.current.notify?.(scanStrings.removed(row.name), 'info', { actionLabel: scanStrings.putBack, onAction: once(() => putBack(row)) })
  }

  const increment = async (key: string): Promise<void> => {
    const d = depsRef.current
    const row = findRow(key)
    if (!row || !d.shop || row.weighed || row.productId === null) return
    const latest = row.scans[row.scans.length - 1]
    if (!latest) return
    const product = d.offline?.products.find((p) => p.id === row.productId)
    const priceCents = row.priceCents ?? product?.lastPriceCents ?? null
    const op: Op = { ...newOpBase(uuid(), 'shop_scan'), productId: row.productId, quantity: latest.quantity }
    if (priceCents !== null) op.priceCents = priceCents
    const result = await d.submit(op)
    await finish(
      op,
      result,
      { ingredientName: row.ingredientName, baseUnit: row.baseUnit, quantity: latest.quantity, priceCents, productName: row.name, ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}) },
      row.name,
    )
  }

  const decrement = async (key: string): Promise<void> => {
    const row = findRow(key)
    if (!row) return
    if (row.count <= 1) {
      await removeOne(row)
      return
    }
    const latest = row.scans[row.scans.length - 1]
    if (latest) await undoScan(latest.clientUuid)
  }

  const removeRow = async (key: string): Promise<void> => {
    const row = findRow(key)
    if (!row) return
    if (row.count > 1) {
      setSheet({ kind: 'confirm_remove', key, name: row.name, count: row.count })
      return
    }
    await removeOne(row)
  }

  const confirmRemove = async (): Promise<void> => {
    if (!sheet || sheet.kind !== 'confirm_remove') return
    const row = findRow(sheet.key)
    setSheet(null)
    if (!row) return
    for (const scan of [...row.scans].reverse()) {
      if (!(await undoScan(scan.clientUuid))) break
    }
  }

  const startPriceEntry = (key?: string): void => {
    const session = depsRef.current.session
    if (!session) return
    if (key !== undefined) {
      setPricing({ key })
      return
    }
    const next = nextWithoutPrice(session.rows)
    setPricing(next ? { key: next.key } : null)
  }

  const closePriceEntry = (): void => setPricing(null)

  /**
   * SR3: a Price entry for a row (shop-scan-proposals.md §13.4, §13.9). The queued scans are edited in the queue (one that
   * already left the queue goes to the server with the applied ones); the applied scans take one PATCH; the list shows
   * the server's Prices. Next moves the entry to the next row without a Price.
   */
  const savePrice = async (key: string, entry: PriceEntry, intent: PriceIntent): Promise<PriceOutcome> => {
    const d = depsRef.current
    const session = d.session
    const row = session?.rows.find((r) => r.key === key)
    if (!session || !row) {
      setPricing(null)
      return { status: 'discarded' }
    }
    const plan = planPriceEntry(row, entry, intent)
    if (plan.kind === 'refuse') return { status: 'refused', error: plan.error }
    if (plan.kind === 'discard') {
      setPricing(null)
      return { status: 'discarded' }
    }
    const entries = session.entries
    const queuedNow: PriceUpdate[] = []
    const toServer: PriceLine[] = [...plan.applied]
    for (const line of plan.queued) {
      const inQueue = d.setQueuedPrice ? await d.setQueuedPrice(line.clientUuid, line.priceCents, line.pricePerKgCents) : false
      if (inQueue) queuedNow.push(line)
      else toServer.push(line)
    }
    if (queuedNow.length > 0) session.reprice(queuedNow)

    let served: PriceUpdate[] = []
    if (toServer.length > 0) {
      // The row's pack Price (and Price per kg), also when only queued scans that left the queue are sent.
      const body: PricePatch = { clientUuids: toServer.map((l) => l.clientUuid), ...entryPrice(entry)! }
      let results: ScanResult[]
      try {
        results = await sendPrices(d, body)
      } catch (err) {
        const error = err instanceof Error ? err.message : scanStrings.priceSaveFailed
        d.notify?.(error, 'error')
        return { status: 'failed', error }
      }
      // A folded scan (it left the queue meanwhile) takes the PATCH's Result now, so its flush Result, which may come
      // later with the Price it was sent with, no longer settles it.
      if (results.length > 0) session.settle(results)
      served = toServer.map((line) => {
        const r = results.find((x) => x.clientUuid === line.clientUuid)
        return {
          clientUuid: line.clientUuid,
          priceCents: r?.scan?.priceCents ?? line.priceCents,
          ...(body.pricePerKgCents !== undefined ? { pricePerKgCents: body.pricePerKgCents } : {}),
        }
      })
      session.reprice(served)
    }

    if (intent === 'next') {
      const updates = [...queuedNow, ...served]
      const after = displayOrder(buildScannedRows(repriceEntries(entries, updates), d.offline?.products ?? []))
      const next = nextWithoutPrice(after, key)
      setPricing(next ? { key: next.key } : null)
    } else {
      setPricing(null)
    }
    return { status: 'saved' }
  }

  const paused = sheet !== null || pricing !== null


  const feedback: FlowFeedback | null = line
    ? { clientUuid: line.clientUuid, text: text(line), queued: line.queued, productName: line.productName, priceCents: line.priceCents, canEditPrice: true, ...(line.imageUrl ? { imageUrl: line.imageUrl } : {}) }
    : null

  return {
    feedback,
    banner,
    sheet,
    paused,
    onScan,
    saveUnknown,
    submitWeight,
    stockTakeAction,
    applySyncResults,
    openEditPrice,
    editPrice,
    undo,
    dismissFeedback: () => setLine(null),
    closeSheet: () => setSheet(null),
    unarchiveProduct,
    unarchiving,
    createNewInstead,
    pricing,
    startPriceEntry,
    closePriceEntry,
    savePrice,
    increment,
    decrement,
    removeRow,
    confirmRemove,
  }
}
