import type { ReactNode } from 'react'
import { Tile } from '../../../ui'
import { importStrings as s } from '../strings'
import type { Warning } from '../types'

/** Titled importStrings.warningsTitle with importStrings.warningsHelp; one item per warning with its JSON path in <code> and the message. Renders nothing for an empty list. */
export function ImageWarningsTile({ warnings }: { warnings: Warning[] }): ReactNode {
  if (warnings.length === 0) return null
  return (
    <Tile as="section">
      <h2>{s.warningsTitle}</h2>
      <p>{s.warningsHelp}</p>
      <ul>
        {warnings.map((w, i) => (
          <li key={`${w.path}-${i}`}>
            <code>{w.path}</code> {w.message}
          </li>
        ))}
      </ul>
    </Tile>
  )
}
