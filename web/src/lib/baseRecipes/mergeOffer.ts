import type { LinkResult } from './types'

// BR-D (design §3.8, last point): the merge offer that ends the bulk link. Pure.

export interface MergeOfferView {
  ingredientId: number
  /** The plain Ingredient's name ("béchamel"). */
  name: string
  /** "béchamel is no longer on any Recipe. Merge it into Béchamel (Base recipe)?" */
  title: string
  /** What moves: "Its 2 Stock Lots and 1 Product move too." / "Nothing else moves." */
  body: string
  mergeLabel: 'Merge'
  keepLabel: 'Keep it'
}

/** One view per offered Ingredient, in the server's order; [] when the server offers none (a line still uses it). */
export function mergeOffers(offer: LinkResult['mergeOffer'], baseName: string): MergeOfferView[] {
  return offer.map((o) => {
    const parts: string[] = []
    if (o.stockLots > 0) parts.push(o.stockLots === 1 ? '1 Stock Lot' : `${o.stockLots} Stock Lots`)
    if (o.products > 0) parts.push(o.products === 1 ? '1 Product' : `${o.products} Products`)
    const joined = parts.length === 2 ? `${parts[0]} and ${parts[1]}` : (parts[0] ?? '')
    const moves = o.stockLots + o.products === 1 ? 'moves' : 'move'
    return {
      ingredientId: o.ingredientId,
      name: o.name,
      title: `${o.name} is no longer on any Recipe. Merge it into ${baseName} (Base recipe)?`,
      body: parts.length === 0 ? 'Nothing else moves.' : `Its ${joined} ${moves} too.`,
      mergeLabel: 'Merge',
      keepLabel: 'Keep it',
    }
  })
}
