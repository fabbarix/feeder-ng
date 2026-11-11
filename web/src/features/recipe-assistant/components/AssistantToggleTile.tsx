import { Chip, Switch, Tile } from '../../../ui'
import type { Status } from '../lib/settingsForm'
import { raStrings } from '../strings'
import '../recipe-assistant.css'

export interface AssistantToggleTileProps {
  enabled: boolean
  status: Status
  disabled?: boolean
  error?: string
  onChange: (enabled: boolean) => void
}

/** The on/off Switch, the privacy note and the status Chip (announced politely when it changes). */
export function AssistantToggleTile({ enabled, status, disabled, error, onChange }: AssistantToggleTileProps) {
  return (
    <Tile as="section" aria-label={raStrings.title} span="full">
      <div className="ra__row">
        <Switch label={raStrings.switchLabel} checked={enabled} disabled={disabled} onChange={onChange} />
        <div aria-live="polite">
          {status.status === 'neutral' ? <Chip kind="tag">{status.label}</Chip> : <Chip kind="status" status={status.status === 'success' ? 'success' : 'spoil'}>{status.label}</Chip>}
        </div>
      </div>
      <p className="ra__muted">{raStrings.privacy}</p>
      {error ? <p className="ra__muted">{error}</p> : null}
    </Tile>
  )
}
