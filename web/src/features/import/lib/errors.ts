import { ApiError } from '../../../lib/http'
import type { FileError, PathError } from '../types'

/**
 * Reads an error thrown while opening a file (an ApiError, see lib/http) into a FileError:
 * invalid_recipe_file -> schema (details.errors), unsupported_version -> version (details.version),
 * invalid_json -> syntax, file_too_large -> tooLarge; anything else -> other with the message.
 */
export function readFileError(err: unknown): FileError {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'invalid_recipe_file': {
        const errors = Array.isArray(err.details.errors) ? (err.details.errors as PathError[]) : []
        return { kind: 'schema', errors }
      }
      case 'unsupported_version':
        return { kind: 'version', version: String(err.details.version) }
      case 'invalid_json':
        return { kind: 'syntax' }
      case 'file_too_large':
        return { kind: 'tooLarge' }
      default:
        return { kind: 'other', message: err.message }
    }
  }
  if (err instanceof Error) return { kind: 'other', message: err.message }
  return { kind: 'other', message: String(err) }
}
