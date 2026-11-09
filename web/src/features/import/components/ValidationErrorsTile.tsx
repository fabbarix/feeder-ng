import type { ReactNode } from 'react'
import type { FileError } from '../types'

/** A Tile (tone 'spoil', role alert) titled importStrings.errorsTitle: for a schema error one list item per error with the JSON path in <code> and the message; for the other kinds the matching sentence (importStrings.unsupportedVersion / notJson / tooLarge / the message). */
export function ValidationErrorsTile(props: { error: FileError }): ReactNode {
  void props
  throw new Error('not implemented')
}
