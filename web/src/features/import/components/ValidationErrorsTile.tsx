import type { ReactNode } from 'react'
import { Tile } from '../../../ui'
import { importStrings as s } from '../strings'
import type { FileError } from '../types'

/** A Tile (tone 'spoil', role alert) titled importStrings.errorsTitle: for a schema error one list item per error with the JSON path in <code> and the message; for the other kinds the matching sentence (importStrings.unsupportedVersion / notJson / tooLarge / the message). */
export function ValidationErrorsTile({ error }: { error: FileError }): ReactNode {
  return (
    <Tile variant="status" status="danger" role="alert" as="section">
      <h2>{s.errorsTitle}</h2>
      <p>{s.errorsHelp}</p>
      {error.kind === 'schema' ? (
        <ul>
          {error.errors.map((e, i) => (
            <li key={`${e.path}-${i}`}>
              <code>{e.path}</code> {e.message}
            </li>
          ))}
        </ul>
      ) : (
        <p>{message(error)}</p>
      )}
    </Tile>
  )
}

function message(error: Exclude<FileError, { kind: 'schema' }>): string {
  switch (error.kind) {
    case 'version':
      return s.unsupportedVersion(error.version)
    case 'syntax':
      return s.notJson
    case 'tooLarge':
      return s.tooLarge
    case 'other':
      return error.message
  }
}
