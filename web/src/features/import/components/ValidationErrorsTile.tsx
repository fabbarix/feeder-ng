import type { ReactNode } from 'react'
import { DetailList, DetailRow, Tile } from '../../../ui'
import { importStrings as s } from '../strings'
import type { FileError } from '../types'

/**
 * A refused file: a warn status Tile (it loses nothing), role alert, titled importStrings.errorsTitle. A schema error lists each error as an
 * R-E row (the JSON path as the key, in <code>, the message as the detail); the other kinds say what is wrong in one sentence.
 */
export function ValidationErrorsTile({ error }: { error: FileError }): ReactNode {
  return (
    <Tile variant="status" status="warn" role="alert" as="section">
      <h2>{s.errorsTitle}</h2>
      <p>{s.errorsHelp}</p>
      {error.kind === 'schema' ? (
        <DetailList tone="warn">
          {error.errors.map((e, i) => (
            <DetailRow key={`${e.path}-${i}`} label={<code>{e.path}</code>} detail={e.message} />
          ))}
        </DetailList>
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
