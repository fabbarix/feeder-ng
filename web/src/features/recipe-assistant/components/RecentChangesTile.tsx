import { ListGroup, ListRow, Tile } from '../../../ui'
import { changeRow, type ModelNames } from '../lib/changes'
import { raStrings } from '../strings'
import type { SettingsChange } from '../types'
import '../recipe-assistant.css'

export interface RecentChangesTileProps {
  changes: SettingsChange[]
  /** "Now" for the "2 h ago" wording. */
  now: Date
  /** Model IDs -> names, once the model list is in; until then the ID is shown. */
  modelNames?: ModelNames
}

/** The last changes to these settings, newest first as given. */
export function RecentChangesTile({ changes, now, modelNames }: RecentChangesTileProps) {
  return (
    <Tile as="section" aria-label={raStrings.recentChanges} span="full">
      {changes.length === 0 ? (
        <p className="ra__muted">{raStrings.noChanges}</p>
      ) : (
        <ListGroup label={raStrings.recentChanges}>
          {changes.map((c, i) => {
            const row = changeRow(c, now, modelNames)
            return <ListRow key={`${c.at}-${i}`} title={row.title} meta={row.meta} />
          })}
        </ListGroup>
      )}
    </Tile>
  )
}
