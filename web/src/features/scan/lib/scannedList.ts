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
  /** what this session's scans cover of the Ingredient's Shopping List Line; null when no applied scan counted against it */
  cover: LineCover | null
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

/**
 * What this session's scans cover of a Shopping List Line, in the Line's Base Unit: "250 of 375 g". Every applied scan of
 * the Ingredient that counted against the list is in `got`, whichever Product it was.
 */
export interface LineCover {
  got: number
  /** the Line's quantity when the session's first such scan was read */
  of: number
  /** nothing more to get: the latest such scan left nothing on the Line */
  done: boolean
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
    kind: 'food',
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

/** Float dust: a remainder this close to 0 is nothing (the server's own tolerance). */
const EPS = 1e-9

/**
 * The cover of an Ingredient's Line by the session's applied scans (in session order). A scan that left some of the Line
 * gives its quantity exactly (what was got up to it, plus its `remaining`). When the first scan already covered it, the
 * Result says only 0, so the Shopping List answers: a ticked Line keeps the quantity it had when it was ticked (`need`), and
 * a list that has not heard of the scans yet still shows it (`quantity`). Without either, the cover is what was got.
 */
function lineCover(ingredientId: number | null, entries: SessionEntry[], list: ShoppingList | undefined): LineCover | null {
  if (ingredientId === null) return null
  const scans = entries.flatMap((e) => (e.result?.scan && e.result.status !== 'rejected' && e.result.scan.onList && e.result.scan.ingredientId === ingredientId ? [e.result.scan] : []))
  if (scans.length === 0) return null
  let got = 0
  let of: number | null = null
  for (const scan of scans) {
    got += scan.quantity
    if (scan.remaining > EPS) of = got + scan.remaining
  }
  if (of === null) {
    const line = list?.lines.find((l) => l.ingredientId === ingredientId)
    const asked = line ? (line.ticked ? line.need : line.quantity) : 0
    of = asked > EPS ? asked : got
  }
  return { got, of, done: scans[scans.length - 1]!.remaining <= EPS }
}

function toRow(key: string, items: { entry: SessionEntry; index: number }[], products: OfflineProduct[], cover: (ingredientId: number | null) => LineCover | null): ScannedRow {
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
    cover: matched?.onList ? cover(described.ingredientId) : null,
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
 * `list`, the live Shopping List, completes a Line's cover when the scans alone cannot tell its quantity (see lineCover).
 */
export function buildScannedRows(entries: SessionEntry[], products: OfflineProduct[], list?: ShoppingList): ScannedRow[] {
  const groups = new Map<string, { entry: SessionEntry; index: number }[]>()
  entries.forEach((entry, index) => {
    if (entry.result?.status === 'rejected') return
    const productId = describeEntry(entry, products).productId
    const key = productId !== null ? String(productId) : `new:${entry.op.clientUuid}`
    const group = groups.get(key)
    if (group) group.push({ entry, index })
    else groups.set(key, [{ entry, index }])
  })
  const covers = new Map<number | null, LineCover | null>()
  const cover = (ingredientId: number | null) => {
    if (!covers.has(ingredientId)) covers.set(ingredientId, lineCover(ingredientId, entries, list))
    return covers.get(ingredientId) ?? null
  }
  return [...groups].map(([key, items]) => toRow(key, items, products, cover))
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
  /** the pack size ("125 g", "9 pieces"), or the weighed amount of a weighed row ("312 g"); '' when unknown */
  size: string
  /** the Shopping List Line it covers, "250 of 375 g", and whether that is all of it; null when not on the list */
  cover: { text: string; done: boolean } | null
  /** every scan still waits in the queue: "Waiting to sync" */
  waiting: boolean
}

/** One amount of an x-of-y: a piece is a bare number (as formatQuantity rounds it); g and ml read as elsewhere. */
function coverAmount(amount: number, base: BaseUnit, system: UnitSystem): string {
  if (base === 'piece') return String(Number(amount.toFixed(1)))
  return formatQuantity(amount, base, system)
}

/** "200 ml" -> ["200", "ml"]; null when the text is not one number and one unit ("1 lb 2 oz"). */
function numberAndUnit(text: string): [string, string] | null {
  const m = /^(-?[\d.]+) (\S+)$/.exec(text)
  return m ? [m[1]!, m[2]!] : null
}

/**
 * "x of y" in the Line's unit, as the Shop screen's Restock reason reads (household-items §4.4): pieces are bare ("2 of 6"),
 * metric g and ml name the unit once when both amounts share it ("250 of 375 g") and keep both when they do not; imperial
 * keeps both ("7.1 oz of 1 lb 2 oz").
 */
export function coverText(got: number, of: number, base: BaseUnit, system: UnitSystem): string {
  let x = coverAmount(got > EPS ? got : 0, base, system)
  const y = coverAmount(of, base, system)
  if (base !== 'piece' && system === 'metric') {
    const a = numberAndUnit(x)
    const b = numberAndUnit(y)
    if (a && b && a[1] === b[1]) x = a[0]
  }
  return scanStrings.coverOf(x, y)
}

/** The pack size of a row (its latest pack scan), or its weighed amount. */
function sizeText(row: ScannedRow, system: UnitSystem): string {
  const amount = row.weighed ? row.weight : ([...row.scans].reverse().find((s) => !s.weighed)?.quantity ?? null)
  return amount !== null && amount > 0 ? formatQuantity(amount, row.baseUnit, system) : ''
}

/** The second line of a row: its size, then the Line it covers (or "Waiting to sync"). Never "On the list" or "ticked". */
export function rowMeta(row: ScannedRow, system: UnitSystem): RowMeta {
  const cover = row.cover && !row.waiting ? { text: coverText(row.cover.got, row.cover.of, row.baseUnit, system), done: row.cover.done } : null
  return { size: sizeText(row, system), cover, waiting: row.waiting }
}

/**
 * The first line of a row: the Product name without the pack size the second line already shows ("Mutti passata 700 g"
 * reads "Mutti passata"). A name that is only the size keeps it.
 */
export function rowTitle(row: ScannedRow, system: UnitSystem): string {
  const size = sizeText(row, system)
  const suffix = ` ${size}`
  return size && row.name.endsWith(suffix) && row.name.length > suffix.length ? row.name.slice(0, -suffix.length).trimEnd() : row.name
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
