// B9-50 (SSP-08): the name matches of a receipt line: the Products first, then the open Lines, at most `limit` in all. Names are compared
// without case, accents and pack sizes ("4 pack", "700 g", "1 l"). Two names match when they are the same words, or every word of the
// shorter is in the longer; one shared word alone is no match. The same words rank above a name that only contains them. Pure TypeScript.
import type { LineCandidate } from '../../scan/lib/lineChoice'
import type { ReceiptMatch } from '../../scan/components/NewProductSheet'
import type { OfflineProduct } from '../../scan/types'

export interface MatchSources {
  products: Pick<OfflineProduct, 'id' | 'name' | 'ingredientId' | 'baseUnit' | 'packSize'>[]
  lines: LineCandidate[]
}

const UNIT = '(?:g|gr|kg|ml|cl|dl|l|lt|pack|pk|pz|pcs?|pieces?|x)'
/** A pack size: "4 pack", "700 g", "1,5 l", "700g", "x4", "4x". */
const PACK = new RegExp(`\\b(?:\\d+(?:[.,]\\d+)?\\s*${UNIT}|x\\s*\\d+)\\b`, 'g')

/** The words of a name, lower case, without accents, punctuation or pack sizes. */
export function nameWords(name: string): string[] {
  const plain = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(PACK, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
  return plain.split(' ').filter((w) => w !== '' && !/^\d+$/.test(w))
}

/** 2 for the same words, 1 when every word of the shorter is in the longer (and the shorter has two words or more, or both are one word), 0 for no match. */
function score(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const sa = new Set(a)
  const sb = new Set(b)
  const [short, long] = sa.size <= sb.size ? [sa, sb] : [sb, sa]
  for (const w of short) if (!long.has(w)) return 0
  if (short.size === long.size) return 2
  // One word in common is not enough when the shorter name is a single word of a longer one ("Olive" in "Olive tapenade" never gets here,
  // as "oil" is missing; "Bananas" alone in "Bananas organic" does). A single-word name still matches the same single word above.
  return short.size >= 2 ? 1 : 0
}

export function receiptMatches(name: string, sources: MatchSources, limit = 3): ReceiptMatch[] {
  const words = nameWords(name)
  if (words.length === 0 || limit <= 0) return []
  const products = sources.products
    .map((p, i) => ({ p, i, s: score(words, nameWords(p.name)) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .map(({ p }): ReceiptMatch => ({ kind: 'product', productId: p.id, name: p.name, ingredientId: p.ingredientId, baseUnit: p.baseUnit, packSize: p.packSize }))
  const seen = new Set<number>()
  const lines = sources.lines
    .map((l, i) => ({ l, i, s: l.ticked || l.quantity <= 0 ? 0 : score(words, nameWords(l.name)) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .filter(({ l }) => (seen.has(l.ingredientId) ? false : (seen.add(l.ingredientId), true)))
    .map(({ l }): ReceiptMatch => ({ kind: 'line', ingredientId: l.ingredientId, name: l.name, baseUnit: l.baseUnit, quantity: l.quantity }))
  return [...products, ...lines].slice(0, limit)
}

/** B9-50: the Product a Not scanned line's name matches best ("Kitchen roll 4 pack is a Product"), or undefined. */
export function bestProductName(name: string, products: { name: string }[]): string | undefined {
  const words = nameWords(name)
  let best: { name: string; s: number } | undefined
  for (const p of products) {
    const s = score(words, nameWords(p.name))
    if (s > 0 && (!best || s > best.s)) best = { name: p.name, s }
  }
  return best?.name
}
