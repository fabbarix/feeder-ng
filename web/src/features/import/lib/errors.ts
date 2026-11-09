import type { FileError } from '../types'

/**
 * Reads an error thrown while opening a file (an ApiError, see lib/http) into a FileError:
 * invalid_recipe_file -> schema (details.errors), unsupported_version -> version (details.version),
 * invalid_json -> syntax, file_too_large -> tooLarge; anything else -> other with the message.
 */
export function readFileError(err: unknown): FileError {
  void err
  throw new Error('not implemented')
}
