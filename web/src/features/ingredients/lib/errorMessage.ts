import { ApiError } from '../../../lib/http'
import { strings } from '../strings'

/** The words for the 422 validation reasons of the Supply rules (H2). */
const VALIDATION_WORDS = new Map<string, string>([
  ['supply_has_shelf_life', strings.errors.supplyHasShelfLife],
  ['restock_level_on_food', strings.errors.restockOnFood],
])

/** The text to show for a failed Ingredient request. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'name_taken') return strings.nameTaken
    if (e.code === 'invalid_ingredient' || e.code === 'in_use' || e.code === 'merge_conflicts') return e.message
    if (e.code === 'kind_differs') return strings.mergeBlockedKind
    if (e.code === 'validation_failed') {
      const words = VALIDATION_WORDS.get(String(e.details.reason))
      if (words !== undefined) return words
    }
  }
  return strings.actionFailed
}
