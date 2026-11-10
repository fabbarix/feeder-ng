/** Matches a file against an `accept` string like ".json,image/*,application/pdf" (extension, exact MIME, or type/*). Empty accept allows all. */
export function acceptsFile(_file: { name: string; type: string }, _accept: string | undefined): boolean {
  throw new Error('not implemented')
}
