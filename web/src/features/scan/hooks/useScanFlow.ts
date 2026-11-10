// The scan flow: a read becomes a Shop scan, an unknown-barcode sheet, an ask-weight sheet or a Stock-take sheet,
// and the line shown afterwards with ✎ and Undo (functional spec §10.1, §10.2). React hook; every side effect is
// injected so tests use fakes.
import { useRef, useState } from 'react'
import { ApiError } from '../../../lib/http'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import type { Scanned } from '../lib/barcode'
import type { Feedback } from '../lib/feedback'
import { planScan, applyAskedWeight, type ScanPlan } from '../lib/resolveScan'
import { feedbackText } from '../lib/toast'
import { toUnknownOp, validateUnknownForm, type UnknownFormValues, type UnknownMode, type UnknownTarget } from '../lib/unknownForm'
import { scanStrings } from '../strings'
import type { OfflineData, OfflineProduct, Op, ScanResult, StockTakeAction } from '../types'

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
  submit: (op: Op) => Promise<ScanResult | null>
  /** drops a still-queued Op (Undo while offline); false when it was already sent */
  cancelQueued: (clientUuid: string) => Promise<boolean>
  undo: (clientUuid: string) => Promise<void>
  setPrice: (clientUuid: string, priceCents: number) => Promise<void>
  feedback: Pick<Feedback, 'confirm' | 'reject'>
  newUuid?: () => string
  now?: () => Date
}

export type FlowSheet =
  | { kind: 'unknown'; mode: UnknownMode; target: UnknownTarget; priceText?: string }
  | { kind: 'ask_weight'; plan: Extract<ScanPlan, { kind: 'ask_weight' }> }
  | { kind: 'stock_take'; product: OfflineProduct }
  | { kind: 'edit_price' }

export interface FlowFeedback {
  clientUuid: string
  /** feedbackText(...) */
  text: string
  /** the Op is in the offline queue */
  queued: boolean
  productName: string
  priceCents: number | null
  canEditPrice: boolean
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
  /** true while a sheet is open: the scanner should not read */
  paused: boolean
  onScan(scanned: Scanned): Promise<void>
  saveUnknown(values: UnknownFormValues): Promise<void>
  submitWeight(grams: number): Promise<void>
  stockTakeAction(action: StockTakeAction, total?: number): Promise<void>
  openEditPrice(): void
  editPrice(priceCents: number): Promise<void>
  undo(): Promise<void>
  dismissFeedback(): void
  closeSheet(): void
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
}

type BaseUnit = 'g' | 'ml' | 'piece'

interface Fallback {
  ingredientName: string
  baseUnit: BaseUnit
  quantity: number
  priceCents: number | null
  productName: string
}

const nowIso = (d: ScanFlowDeps) => (d.now ? d.now() : new Date()).toISOString()

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

  const text = (l: Pick<Line, 'ingredientName' | 'baseUnit' | 'quantity' | 'priceCents' | 'onList'>) =>
    feedbackText({ ingredientName: l.ingredientName, quantity: l.quantity, baseUnit: l.baseUnit, priceCents: l.priceCents, currency: depsRef.current.currency, onList: l.onList }, depsRef.current.system)

  /** Applies the Result of one Op (or the queueing when null) to the feedback line and the banner. */
  const finish = async (clientUuid: string, result: ScanResult | null, fallback: Fallback, productName: string) => {
    const d = depsRef.current
    if (result === null) {
      d.feedback.confirm()
      setBanner(null)
      setLine({ clientUuid, ingredientName: fallback.ingredientName, baseUnit: fallback.baseUnit, quantity: fallback.quantity, priceCents: fallback.priceCents, onList: true, queued: true, productName })
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
    const s = result.scan
    setLine({
      clientUuid,
      ingredientName: s?.ingredientName ?? fallback.ingredientName,
      baseUnit: s?.baseUnit ?? fallback.baseUnit,
      quantity: s?.quantity ?? fallback.quantity,
      priceCents: s ? s.priceCents : fallback.priceCents,
      onList: s?.onList ?? true,
      queued: false,
      productName: s?.productName ?? productName,
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
    const result = await d.submit(op)
    await finish(
      op.clientUuid,
      result,
      { ingredientName: plan.product.ingredientName, baseUnit: plan.product.baseUnit, quantity: plan.quantity, priceCents: plan.priceCents, productName: plan.product.name },
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

  const onScan = async (scanned: Scanned): Promise<void> => {
    const d = depsRef.current
    if (!d.offline) return
    const stockTake = d.mode === 'stocktake'
    setBanner(null)
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
      case 'unknown_weighed':
        if (stockTake) setBanner({ tone: 'info', text: scanStrings.unknownAtHome })
        else openUnknown(plan)
        return
      case 'not_product':
        setBanner({ tone: 'info', text: scanStrings.notProduct })
        return
      case 'invalid':
        d.feedback.reject()
        setBanner({ tone: 'warn', text: scanStrings.unreadable })
        return
    }
  }

  const saveUnknown = async (values: UnknownFormValues): Promise<void> => {
    const d = depsRef.current
    if (!sheet || sheet.kind !== 'unknown' || !d.shop) return
    if (Object.keys(validateUnknownForm(values, sheet.mode)).length > 0) return
    const op = toUnknownOp(values, sheet.target, { clientUuid: uuid(), scannedAt: nowIso(d), shopId: d.shop.id, rangeTo: d.rangeTo })
    const result = await d.submit(op)
    setSheet(null)
    await finish(
      op.clientUuid,
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
      op.clientUuid,
      result,
      { ingredientName: plan.product.ingredientName, baseUnit: plan.product.baseUnit, quantity: asked.quantity, priceCents: asked.priceCents, productName: plan.product.name },
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
      setBanner({ tone: 'info', text: scanStrings.waitingToSync })
      return
    }
    if (result.status === 'rejected') {
      d.feedback.reject()
      setBanner({ tone: 'warn', text: scanStrings.rejectedAdd(result.error?.message ?? '') })
      return
    }
    d.feedback.confirm()
    const s = result.scan
    if (s?.total !== undefined) {
      setBanner({ tone: 'info', text: scanStrings.inStock(s.ingredientName, formatQuantity(s.total, s.baseUnit, d.system)) })
    }
  }

  const openEditPrice = () => {
    if (line && !line.queued) setSheet({ kind: 'edit_price' })
  }

  const editPrice = async (priceCents: number): Promise<void> => {
    if (!line) return
    await depsRef.current.setPrice(line.clientUuid, priceCents)
    setLine({ ...line, priceCents })
    setSheet(null)
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

  const feedback: FlowFeedback | null = line
    ? { clientUuid: line.clientUuid, text: text(line), queued: line.queued, productName: line.productName, priceCents: line.priceCents, canEditPrice: !line.queued }
    : null

  return {
    feedback,
    banner,
    sheet,
    paused: sheet !== null,
    onScan,
    saveUnknown,
    submitWeight,
    stockTakeAction,
    openEditPrice,
    editPrice,
    undo,
    dismissFeedback: () => setLine(null),
    closeSheet: () => setSheet(null),
  }
}
