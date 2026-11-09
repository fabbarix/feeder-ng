import { ApiError } from '../../../lib/http'
import { strings } from '../strings'

/** The text to show for a failed Ingredient request. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'name_taken') return strings.nameTaken
    if (e.code === 'invalid_ingredient' || e.code === 'in_use' || e.code === 'merge_conflicts') return e.message
  }
  return strings.actionFailed
}
