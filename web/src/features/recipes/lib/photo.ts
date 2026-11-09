import { ApiError } from '../../../lib/http'
import { recipeStrings } from '../strings'

/** The message for a failed photo upload: too large, not an image, or anything else. */
export function photoErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'image_too_large') return recipeStrings.photoErrors.tooLarge
    if (err.code === 'unsupported_image') return recipeStrings.photoErrors.unsupported
  }
  return recipeStrings.photoErrors.failed
}
