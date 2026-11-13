import type { LinkCandidateRow } from './types'
import type { MergeOfferView } from './mergeOffer'

export interface UseLinkCandidatesOptions {
  baseRecipeId: number
  baseName: string
  /** The Base Unit of the Base recipe's Ingredient ("ml"). */
  baseUnit: string
  /** The Base recipe's Ingredient: what a merge goes into. */
  baseIngredientId: number
  /** The sheet is finished (Not now, or the merge offer answered). */
  onDone: () => void
}

export interface UseLinkCandidates {
  status: 'loading' | 'ready' | 'error'
  /** 'pick' = the list; 'merge' = the offer that follows a link that left an old Ingredient on no line. */
  step: 'pick' | 'merge'
  /** linkHeading(distinct Recipes, the candidates' Ingredient name). */
  heading: string
  rows: LinkCandidateRow[]
  /** linkLabel(ticked). */
  linkLabel: string
  /** False with nothing ticked or while linking. */
  canLink: boolean
  toggle: (lineId: number) => void
  /** POST /link with the ticked lines; success: a Toast "Linked 2 Recipes" with Undo (POST /unlink), then step 'merge' when the server offered one, else onDone. */
  link: () => Promise<void>
  /** Links nothing; calls onDone. */
  notNow: () => void
  /** The merge offer being asked (the first of the server's offer not yet answered); null outside step 'merge'. */
  offer: MergeOfferView | null
  /** Merge: preview first; when blocked (base_unit_mismatch) or it has conflicts nothing is merged and `mergeIssue` says why; else POST merge { into }. Then the next offer, or onDone. */
  merge: () => Promise<void>
  /** Keep it: the next offer, or onDone. Merges nothing. */
  keep: () => void
  mergeIssue: string | null
  /** Words for a failed link (a refusal message or the generic one), or null. */
  error: string | null
}

/** Hook of the LinkCandidatesSheet (design §3.8). Fetches `GET /api/recipes/{id}/link-candidates`; the rows, counts and words come from lib/baseRecipes. */
export function useLinkCandidates(opts: UseLinkCandidatesOptions): UseLinkCandidates {
  void opts
  throw new Error('BR-D: not implemented')
}
