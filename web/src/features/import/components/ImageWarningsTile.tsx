import type { ReactNode } from 'react'
import { DetailList, DetailRow, Tile } from '../../../ui'
import { importStrings as s } from '../strings'
import type { Warning } from '../types'

/**
 * Titled importStrings.warningsTitle with importStrings.warningsHelp; one R-E row per warning (B9-55): the JSON path in <code> as the key, the
 * message as the detail, as ValidationErrorsTile. Renders nothing for an empty list.
 */
export function ImageWarningsTile({ warnings }: { warnings: Warning[] }): ReactNode {
  if (warnings.length === 0) return null
  return (
    <Tile as="section">
      <h2>{s.warningsTitle}</h2>
      <p>{s.warningsHelp}</p>
      <DetailList>
        {warnings.map((w, i) => (
          <DetailRow key={`${w.path}-${i}`} label={<code>{w.path}</code>} detail={w.message} />
        ))}
      </DetailList>
    </Tile>
  )
}
