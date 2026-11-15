// B9-50 (SSP-08): the "Is it one of these?" step of a receipt line's Add… (no barcode). Pure TypeScript, no React: what the step offers,
// the Lines left for "Other Lines", the note under a chosen Product, and the Product a new name already is.
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { newProductStrings } from '../newProductStrings'
import type { ReceiptLineInfo, ReceiptMatch } from '../components/NewProductSheet'
import type { LineCandidate, LineChip, LineChips } from './lineChoice'

const t = newProductStrings.receipt

/** A match's value in the radiogroup: "product:50" or "line:7". */
export const matchKey = (m: ReceiptMatch): string => (m.kind === 'product' ? `product:${m.productId}` : `line:${m.ingredientId}`)

/** What a match says after its name: "Product · 4 pieces", "Line · 2 pieces". */
export function matchNote(m: ReceiptMatch, system: UnitSystem): string {
  return m.kind === 'product' ? `${t.product} · ${formatQuantity(m.packSize, m.baseUnit, system)}` : `${t.line} · ${formatQuantity(m.quantity, m.baseUnit, system)}`
}

/** The match chosen when the step opens: the first, when it is a Product; a Line is never chosen for the person. */
export function initialMatchKey(matches: ReceiptMatch[]): string | null {
  const first = matches[0]
  return first?.kind === 'product' ? matchKey(first) : null
}

/** How many "Other Lines" show before "More Lines" (mocks/ssp-08-add.html draws three), so a chosen match's note and Use stay near it. */
export const OTHER_LINES_SHOWN = 3

/** The Lines under "Other Lines": every chip but the Lines the matches already offer; three show, the rest are behind "More Lines". */
export function otherLines(chips: LineChips, matches: ReceiptMatch[]): LineChips {
  const offered = new Set(matches.filter((m) => m.kind === 'line').map((m) => m.ingredientId))
  const all = [...chips.chips, ...chips.more].filter((c) => !offered.has(c.ingredientId))
  return { chips: all.slice(0, OTHER_LINES_SHOWN), more: all.slice(OTHER_LINES_SHOWN) }
}

/** The Line chip a Line match stands for: the sheet's own chip of that Ingredient, else one built from the match. */
export function chipOfLineMatch(m: Extract<ReceiptMatch, { kind: 'line' }>, chips: LineChips): LineChip {
  const found = [...chips.chips, ...chips.more].find((c) => c.ingredientId === m.ingredientId)
  return found ?? { ingredientId: m.ingredientId, name: m.name, baseUnit: m.baseUnit, kind: 'food', restock: false, quantity: m.quantity }
}

/** The note under a chosen Product: its Scans, the line's price, and the open Line of its Ingredient it ticks. */
export function productNote(product: Extract<ReceiptMatch, { kind: 'product' }>, line: ReceiptLineInfo | undefined, lines: LineCandidate[]): string {
  const ticks = lines.find((l) => !l.ticked && l.quantity > 0 && l.ingredientId === product.ingredientId)
  return t.useNote(product.name, t.scans(line?.scans ?? 1), line?.priceText, ticks?.name)
}

const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase()

/** The known Product whose name is this new name (without case, accents or extra spaces), if any. */
export function productNamed<P extends { id?: number; name?: string }>(name: string, products: P[]): (P & { id: number; name: string }) | undefined {
  const want = plain(name)
  if (want === '') return undefined
  return products.find((p): p is P & { id: number; name: string } => typeof p.id === 'number' && typeof p.name === 'string' && plain(p.name) === want)
}
