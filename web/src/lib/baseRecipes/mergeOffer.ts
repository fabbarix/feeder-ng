import type { LinkResult } from './types'

// BR-D (design §3.8, last point): the merge offer that ends the bulk link. Pure.

export interface MergeOfferView {
  ingredientId: number
  /** "béchamel is no longer on any Recipe. Merge it into Béchamel (Base recipe)?" */
  title: string
  /** What moves: "Its 2 Stock Lots and 1 Product move too." / "Nothing else moves." */
  body: string
  mergeLabel: 'Merge'
  keepLabel: 'Keep it'
}

/** One view per offered Ingredient, in the server's order; [] when the server offers none (a line still uses it). */
export function mergeOffers(offer: LinkResult['mergeOffer'], baseName: string): MergeOfferView[] {
  void offer; void baseName
  throw new Error('BR-D: not implemented')
}
