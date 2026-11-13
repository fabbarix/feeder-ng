// SR3: the Scanned list as plain data (shop-scan-proposals.md §13.2, §13.3, §13.6, §13.7). The scans of a Shop and day
// (Ops with their server Results, or null while queued) are grouped into one row per Product. Pure TypeScript, no React.
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import type { ShoppingLine, ShoppingList } from '../../shop/types'
import { scanStrings } from '../strings'
import type { BaseUnit, IngredientKind, OfflineProduct, Op, ScanResult } from '../types'

/** One scan of the session: the Op and the server's Result, or null while it waits in the offline queue. */
export interface SessionEntry {
  op: Op
  result: ScanResult | null
}

/** One scan of a row, as the Price entry and the Undo need it. */
export interface ScanRef {
  clientUuid: string
  queued: boolean
  quantity: number
  weighed: boolean
  priceCents: number | null
  pricePerKgCents: number | null
}

/** One Product's row of the Scanned list. */
export interface ScannedRow {
  /** the Product id, or `new:<uuid>` for a Product that a queued scan has not created yet */
  key: string
  productId: number | null
  name: string
  ingredientId: number | null
  ingredientName: string
  kind: IngredientKind
  baseUnit: BaseUnit
  imageUrl?: string
  count: number
  clientUuids: string[]
  scans: ScanRef[]
  /** every scan still waits in the queue */
  waiting: boolean
  /** some scan still waits in the queue */
  pending: boolean
  /** the latest applied scan's match with the Shopping List */
  onList: boolean
  ticked: boolean
  remaining: number | null
  weighed: boolean
  /** the weighed grams of the row; null for a pack row */
  weight: number | null
  /** the latest scan's Price */
  priceCents: number | null
  /** the latest weighed scan's Price per kg (per l); null without one */
  perKgCents: number | null
  /** the sum of the scans' Prices; null while one still has none */
  totalCents: number | null
  needsPrice: boolean
  /** index of the row's latest scan in the session (newest first in displayOrder) */
  latest: number
}

export interface ScannedTotals {
  spentCents: number
  unpricedCount: number
}

/** A new Price for one scan (queued or applied). */
export interface PriceUpdate {
  clientUuid: string
  priceCents: number
  pricePerKgCents?: number
}

interface Described {
  productId: number | null
  name: string
  ingredientId: number | null
  ingredientName: string
  kind: IngredientKind
  baseUnit: BaseUnit
  imageUrl?: string
  packSize?: number
}

/** What a scan is called: the server's Result when there is one, else the offline Product, else the Op itself. */
function describeEntry(entry: SessionEntry, products: OfflineProduct[]): Described {
  const { op, result } = entry
  const scan = result?.scan
  const productId = scan?.productId ?? op.productId ?? null
  const product = productId === null ? undefined : products.find((p) => p.id === productId)
  if (scan) {
    const described: Described = {
      productId,
      name: scan.productName,
      ingredientId: scan.ingredientId,
      ingredientName: scan.ingredientName,
      kind: scan.ingredientKind ?? product?.ingredientKind ?? 'food',
      baseUnit: scan.baseUnit,
    }
    const imageUrl = scan.productImageUrl || scan.ingredientImageUrl
    if (imageUrl) described.imageUrl = imageUrl
    if (product) described.packSize = product.packSize
    return described
  }
  if (product) {
    const described: Described = {
      productId,
      name: product.name,
      ingredientId: product.ingredientId,
      ingredientName: product.ingredientName,
      kind: product.ingredientKind ?? 'food',
      baseUnit: product.baseUnit,
      packSize: product.packSize,
    }
    const imageUrl = product.imageUrl || product.ingredientImageUrl
    if (imageUrl) described.imageUrl = imageUrl
    return described
  }
  return {
    productId: null,
    name: op.productName ?? '',
    ingredientId: op.ingredient?.id ?? null,
    ingredientName: op.ingredient?.name ?? op.productName ?? '',
    kind: op.ingredient?.kind ?? 'food',
    baseUnit: op.ingredient?.baseUnit ?? 'g',
  }
}

/** One scan as a row's entry. A weighed scan is one priced by its weight (a flag, or a per kg Price on a non-pack quantity). */
function scanRef(entry: SessionEntry, products: OfflineProduct[]): ScanRef {
  const { op, result } = entry
  const scan = result?.scan
  const productId = scan?.productId ?? op.productId ?? null
  const product = productId === null ? undefined : products.find((p) => p.id === productId)
  const quantity = scan?.quantity ?? op.quantity ?? 0
  const weighed = op.weighed === true || (op.pricePerKgCents !== undefined && product !== undefined && quantity !== product.packSize)
  // The server is right: the Result's Price wins over the Op's.
  const priceCents = scan ? scan.priceCents : (op.priceCents ?? null)
  return {
    clientUuid: op.clientUuid,
    queued: result === null,
    quantity,
    weighed,
    priceCents,
    pricePerKgCents: op.pricePerKgCents ?? null,
  }
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)

function toRow(key: string, items: { entry: SessionEntry; index: number }[], products: OfflineProduct[]): ScannedRow {
  const latest = items[items.length - 1]!
  const described = describeEntry(latest.entry, products)
  const scans = items.map((i) => scanRef(i.entry, products))
  const latestApplied = [...items].reverse().find((i) => i.entry.result !== null)
  const matched = latestApplied?.entry.result?.scan
  const latestScan = scans[scans.length - 1]!
  const weighedScans = scans.filter((s) => s.weighed)
  const weighed = weighedScans.length > 0
  const needsPrice = scans.some((s) => s.priceCents === null)
  const row: ScannedRow = {
    key,
    productId: described.productId,
    name: described.name,
    ingredientId: described.ingredientId,
    ingredientName: described.ingredientName,
    kind: described.kind,
    baseUnit: described.baseUnit,
    count: scans.length,
    clientUuids: scans.map((s) => s.clientUuid),
    scans,
    waiting: scans.every((s) => s.queued),
    pending: scans.some((s) => s.queued),
    onList: matched?.onList ?? false,
    ticked: matched?.ticked ?? false,
    remaining: matched ? matched.remaining : null,
    weighed,
    weight: weighed ? sum(weighedScans.map((s) => s.quantity)) : null,
    priceCents: latestScan.priceCents,
    perKgCents: weighed ? latestScan.pricePerKgCents : null,
    totalCents: needsPrice ? null : sum(scans.map((s) => s.priceCents ?? 0)),
    needsPrice,
    latest: latest.index,
  }
  if (described.imageUrl) row.imageUrl = described.imageUrl
  return row
}

/**
 * One row per Product, in first-scan order. A Result that the server rejected is left out (its notice says why); a
 * duplicate counts like an applied scan. A scan that creates a Product is a row of its own until its Result names one.
 */
export function buildScannedRows(entries: SessionEntry[], products: OfflineProduct[]): ScannedRow[] {
  const groups = new Map<string, { entry: SessionEntry; index: number }[]>()
  entries.forEach((entry, index) => {
    if (entry.result?.status === 'rejected') return
    const productId = describeEntry(entry, products).productId
    const key = productId !== null ? String(productId) : `new:${entry.op.clientUuid}`
    const group = groups.get(key)
    if (group) group.push({ entry, index })
    else groups.set(key, [{ entry, index }])
  })
  return [...groups].map(([key, items]) => toRow(key, items, products))
}

/** Newest first: a rescan moves its row to the top. Does not change the input. */
export function displayOrder(rows: ScannedRow[]): ScannedRow[] {
  return [...rows].sort((a, b) => b.latest - a.latest)
}

/** The total of the priced rows, and how many rows still have no Price (counted per row, not per scan). */
export function scannedTotals(rows: ScannedRow[]): ScannedTotals {
  return {
    spentCents: sum(rows.filter((r) => !r.needsPrice).map((r) => r.totalCents ?? 0)),
    unpricedCount: rows.filter((r) => r.needsPrice).length,
  }
}

/**
 * The next row without a Price after `current`, going down and wrapping to the top; without a current row, the first
 * one from the top. Never the current row itself. Null when every row has a Price.
 */
export function nextWithoutPrice(rows: ScannedRow[], current?: string | null): ScannedRow | null {
  const at = current == null ? -1 : rows.findIndex((r) => r.key === current)
  const ordered = at < 0 ? rows : [...rows.slice(at + 1), ...rows.slice(0, at)]
  return ordered.find((r) => r.needsPrice) ?? null
}

export interface RowMeta {
  tone: 'success' | 'muted'
  text: string
  mark: 'tick' | 'outline' | 'clock' | null
}

/** The one-line state of a row under its name. */
export function rowMeta(row: ScannedRow, system: UnitSystem): RowMeta {
  if (row.waiting) return { tone: 'muted', text: scanStrings.waitingToSync, mark: 'clock' }
  if (row.onList) {
    if (row.weighed) {
      return { tone: 'success', text: scanStrings.onListWeight(formatQuantity(row.weight ?? 0, row.baseUnit, system)), mark: row.ticked ? 'tick' : 'outline' }
    }
    if (row.ticked || (row.remaining ?? 0) <= 0) return { tone: 'success', text: scanStrings.onListTicked(row.ingredientName), mark: 'tick' }
    return { tone: 'success', text: scanStrings.onListStillToGet(formatQuantity(row.remaining ?? 0, row.baseUnit, system)), mark: 'outline' }
  }
  if (row.weighed) return { tone: 'muted', text: formatQuantity(row.weight ?? 0, row.baseUnit, system), mark: null }
  return { tone: 'muted', text: scanStrings.rowNotOnList, mark: null }
}

/** The value and the sub-value of a row. `money` formats minor units (the caller knows the currency). */
export function rowAmounts(row: ScannedRow, money: (cents: number) => string): { value: string | null; sub: string } {
  const value = row.totalCents === null ? null : money(row.totalCents)
  if (row.weighed) {
    const sub = row.perKgCents === null ? `×${row.count}` : row.baseUnit === 'ml' ? scanStrings.perL(money(row.perKgCents)) : scanStrings.perKg(money(row.perKgCents))
    return { value, sub }
  }
  if (row.count === 1 || row.priceCents === null) return { value, sub: `×${row.count}` }
  return { value, sub: `×${row.count} · ${money(row.priceCents)}` }
}

/** The title of the confirm dialog that removes a row of two or more scans. */
export function removeTitle(row: ScannedRow): string {
  return scanStrings.removeTitle(row.count, row.name)
}

/** The Shopping List's Lines not yet scanned: ticked Lines are out, and so is a Line whose scan still waits in the queue. */
export function toGetLines(list: ShoppingList | undefined, rows: ScannedRow[]): ShoppingLine[] {
  return (list?.lines ?? []).filter((line) => !line.ticked && !rows.some((r) => r.waiting && r.ingredientId === line.ingredientId))
}

/** Appends a scan. Answers a new array. */
export function recordEntry(entries: SessionEntry[], op: Op, result: ScanResult | null): SessionEntry[] {
  return [...entries, { op, result }]
}

/**
 * The Results of a sync flush: a waiting scan takes its Result; a rejected one leaves the session (the sync notice says
 * why). Entries without a Result in `results`, and scans that already have one, are left as they are: a flush Result
 * that arrives after a Price save of the same scan must not put its old Price back.
 */
export function settleEntries(entries: SessionEntry[], results: ScanResult[]): SessionEntry[] {
  if (results.length === 0) return entries
  const byUuid = new Map(results.map((r) => [r.clientUuid, r]))
  const out: SessionEntry[] = []
  for (const entry of entries) {
    const result = byUuid.get(entry.op.clientUuid)
    if (!result || entry.result !== null) out.push(entry)
    else if (result.status !== 'rejected') out.push({ op: entry.op, result })
  }
  return out
}

/** Removes the scans with these uuids. */
export function dropEntries(entries: SessionEntry[], clientUuids: string[]): SessionEntry[] {
  return entries.filter((e) => !clientUuids.includes(e.op.clientUuid))
}

/** Sets the Price (and the Price per kg, when given) of the scans, on the Op and on the Result. */
export function repriceEntries(entries: SessionEntry[], updates: PriceUpdate[]): SessionEntry[] {
  if (updates.length === 0) return entries
  const byUuid = new Map(updates.map((u) => [u.clientUuid, u]))
  return entries.map((entry) => {
    const update = byUuid.get(entry.op.clientUuid)
    if (!update) return entry
    const op: Op = { ...entry.op, priceCents: update.priceCents }
    if (update.pricePerKgCents !== undefined) op.pricePerKgCents = update.pricePerKgCents
    const result = entry.result?.scan ? { ...entry.result, scan: { ...entry.result.scan, priceCents: update.priceCents } } : entry.result
    return { op, result }
  })
}
