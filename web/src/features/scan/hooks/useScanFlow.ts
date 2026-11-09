// The scan flow: a read becomes a Shop scan, an unknown-barcode sheet, an ask-weight sheet or a Stock-take sheet,
// and the line shown afterwards with ✎ and Undo (functional spec §10.1, §10.2). React hook; every side effect is
// injected so tests use fakes. Stubs until implemented.
import type { UnitSystem } from '../../../lib/units'
import type { Scanned } from '../lib/barcode'
import type { Feedback } from '../lib/feedback'
import type { ScanPlan } from '../lib/resolveScan'
import type { UnknownFormValues, UnknownMode, UnknownTarget } from '../lib/unknownForm'
import type { Bundle, BundleProduct, Op, ScanResult, StockTakeAction } from '../types'

export interface ScanFlowDeps {
  mode: 'shop' | 'stocktake'
  /** required in shop mode */
  shop: { id: number; name: string } | null
  /** the cached bundle of the Shop (or home); scans are ignored until it is there */
  bundle: Bundle | null
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
  | { kind: 'stock_take'; product: BundleProduct }
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
  onScan(scanned: Scanned): void
  saveUnknown(values: UnknownFormValues): Promise<void>
  submitWeight(grams: number): Promise<void>
  stockTakeAction(action: StockTakeAction, total?: number): Promise<void>
  openEditPrice(): void
  editPrice(priceCents: number): Promise<void>
  undo(): Promise<void>
  dismissFeedback(): void
  closeSheet(): void
}

/**
 * Shop mode: planScan(scanned, bundle). known -> build a shop_scan Op (new clientUuid, scannedAt = now, shopId,
 * rangeTo, productId, quantity, priceCents when known), call feedback.confirm(), submit, then show the feedback
 * line from the Result (price = result price, else the plan's; "not on the list" when result.onList is false; no
 * such words when queued). A rejected Result shows a warn banner with its message and feedback.reject(). unknown ->
 * sheet 'unknown' (mode 'pack'); unknown_weighed -> mode 'weighed' or 'weighed_price' (needsWeight); ask_weight ->
 * sheet 'ask_weight'; not_product -> banner "Not a product code"; invalid -> banner "Couldn't read that, try
 * again" and feedback.reject(). Stock-take mode: known -> sheet 'stock_take'; unknown -> banner "Unknown barcode: add
 * it by scanning in a Shop". Undo: cancelQueued when the Op is still queued, else undo(); either clears the feedback.
 */
export function useScanFlow(deps: ScanFlowDeps): ScanFlow {
  void deps
  throw new Error('not implemented')
}
