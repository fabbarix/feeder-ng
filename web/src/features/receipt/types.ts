// The wire and state types of receipt reading (RR4). The wire shapes mirror internal/receipt/httpapi/{dto.go,reads.go,apply.go}
// exactly; arrays are never null. Types only: no runtime code lives in this file.
import type { ScanResult } from '../scan/types'

export type { ScanResult }

export type ProposalKind = 'shop' | 'date' | 'price' | 'weight' | 'quantity' | 'pack_size' | 'name' | 'add' | 'missing'

/** One side (before or after) of a proposal. A missing key means "not set". */
export interface ProposalValue {
  priceCents?: number
  perKg?: boolean
  grams?: number
  count?: number
  packSize?: number
  packUnit?: string
  name?: string
  date?: string
  shop?: string
  shopId?: number
}

export interface Proposal {
  /** "price:0", "weight:3", "add:1", "missing:5", "shop", "date": the id the apply takes. */
  id: string
  kind: ProposalKind
  /** The Scanned row (index into `rows`); -1 for shop, date and Adds. */
  row: number
  /** The receipt line (Adds); -1 otherwise. */
  line: number
  /** The receipt line as printed. */
  text: string
  /** The server's default for the review: Prices, Weighed Products and Quantities are true. */
  checked: boolean
  /** An Add: it waits for the User's choices before it can be applied. */
  needsInput: boolean
  before: ProposalValue
  after: ProposalValue
}

export interface ReceiptRow {
  row: number
  productId: number
  product: string
  barcode: string
  baseUnit: 'g' | 'ml' | 'piece'
  packSize: number
  scans: number
  quantity: number
  weighed: boolean
  priceCents: number
  perKgCents: number
}

export type NoteCode = 'shop_unknown' | 'discount' | 'total_differs'

export interface ReceiptNote {
  code: NoteCode
  text: string
  /** discount: the (negative) amount. total_differs: the receipt's total minus the lines after all proposals (negative = less). */
  cents?: number
}

export interface ReceiptTotals {
  scannedCents: number
  projectedCents: number
  receiptCents?: number
  lines: number
}

export interface ReadRunning {
  status: 'running'
}
export interface ReadFailed {
  status: 'failed'
  error: { code: string; message: string; retryAfterSeconds?: number }
}
export interface ReadDone {
  status: 'done'
  fingerprint: string
  rows: ReceiptRow[]
  proposals: Proposal[]
  notes: ReceiptNote[]
  totals: ReceiptTotals
  warnings: { code: string; line: number }[]
}
export type ReadView = ReadRunning | ReadFailed | ReadDone

export interface StartReadBody {
  shopId: number
  clientUuids: string[]
  photos: { dataUrl: string }[]
}

/** The Scanned list this phone holds for the Shop: what a read starts from and an apply is checked against. */
export interface ReceiptSession {
  shopId: number
  clientUuids: string[]
}

/** The Add… choices of a "Not scanned" line. */
export type AddIngredient = { id: number } | { name: string; baseUnit: 'g' | 'ml' | 'piece'; kind: 'food' | 'supply' }
export interface AddDraft {
  ingredient: AddIngredient | null
  productName: string
  packSize: number
  scope?: 'global' | 'shop'
}

export interface ReviewState {
  /** Proposal id -> checked. */
  checked: Record<string, boolean>
  /** Proposal id -> the Add's choices so far. */
  adds: Record<string, AddDraft>
}

export type AddProblem = 'ingredient' | 'productName' | 'packSize'

export type SectionId = 'shopDate' | 'prices' | 'weighed' | 'quantities' | 'corrections' | 'notScanned' | 'notOnReceipt'
export interface ReviewSection {
  id: SectionId
  title: string
  proposals: Proposal[]
}

export interface ApplyAdd {
  id: string
  ingredient: { id: number } | { name: string; baseUnit: string; kind: string }
  productName: string
  packSize: number
  scope?: 'global' | 'shop'
}
export interface ApplyBody {
  readId: string
  fingerprint: string
  clientUuids: string[]
  accept: { id: string }[]
  adds: ApplyAdd[]
}

/** What receiptApi.apply resolves with; it never rejects (a refusal, a 500 and a lost connection are all `ok: false`). */
export type ApplyOutcome =
  | { ok: true; applied: number; results: ScanResult[]; undone: string[] }
  | { ok: false; status: number; code: string; message: string; id?: string; results: ScanResult[] }

/** A failure of a read or an apply, reduced to what the copy needs. */
export interface ReceiptErrorInput {
  code: string
  /** assistant_unavailable: the Recipe Assistant's reason ("off", "no_key", "no_secret_key", "key_unreadable", "model_unavailable"). */
  reason?: string
  retryAfterSeconds?: number
}
/** retry: "Try again" with the same input. readAgain: "Read it again" (back to the photos). settings: link to /settings/recipe-assistant (Admins). none: nothing to press. */
export type ReceiptErrorAction = 'retry' | 'readAgain' | 'settings' | 'none'
export interface ReceiptErrorCopy {
  message: string
  action: ReceiptErrorAction
}

/** A finished read kept for the review (10 minutes). */
export interface StoredRead {
  readId: string
  shopId: number
  /** The uuids the read was made from. */
  clientUuids: string[]
  read: ReadDone
  storedAt: number
}

/** What the apply hands to the Scanned session. */
export interface ReceiptAppliedEvent {
  readId: string
  /** The server's count (0 when the apply failed). */
  applied: number
  /** true for 500 receipt_apply_failed: `results` are the scans the put-back wrote. */
  failed: boolean
  results: ScanResult[]
  /** The uuids of the session's scans the apply undid (a success only; absent or [] otherwise). */
  undone?: string[]
}
