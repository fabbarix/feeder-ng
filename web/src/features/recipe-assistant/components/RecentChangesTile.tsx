import { ListGroup, ListRow, Tile } from '../../../ui'
import { changeRow } from '../lib/changes'
import { raStrings } from '../strings'
import type { SettingsChange } from '../types'
import '../recipe-assistant.css'

export interface RecentChangesTileProps {
  changes: SettingsChange[]
  /** "Now" for the "2 h ago" wording. */
  now: Date
}

/** The last changes to these settings, newest first as given. */
export function RecentChangesTile({ changes, now }: RecentChangesTileProps) {
  return (
    <Tile as="section" aria-label={raStrings.recentChanges} span="full">
      {changes.length === 0 ? (
        <p className="ra__muted">{raStrings.noChanges}</p>
      ) : (
        <ListGroup label={raStrings.recentChanges}>
          {changes.map((c, i) => {
            const row = changeRow(c, now)
            return <ListRow key={`${c.at}-${i}`} title={row.title} meta={row.meta} />
          })}
        </ListGroup>
      )}
    </Tile>
  )
}
