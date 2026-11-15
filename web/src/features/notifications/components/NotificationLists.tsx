// The lists of the notification settings (NotificationSettingsView): this device's type switches and the other devices' rows.
// Split out of the tile file (B9-55): rows with a Switch or a Remove button, not bullet sentences. Renders and wires events only.
import type { ReactElement } from 'react'
import { Button, ListRow, Switch } from '../../../ui'
import { notificationStrings as s } from '../strings'
import { NOTIFICATION_TYPES, type NotificationType, type PushDevice } from '../types'

/** One row per notification type: its hint and its Switch. */
export function TypeSwitches({ types, onChange }: { types: PushDevice['types']; onChange: (type: NotificationType, on: boolean) => void }): ReactElement {
  return (
    <ul className="notifications__types">
      {NOTIFICATION_TYPES.map((type) => (
        <TypeSwitch key={type} type={type} on={types[type]} onChange={(on) => onChange(type, on)} />
      ))}
    </ul>
  )
}

function TypeSwitch({ type, on, onChange }: { type: NotificationType; on: boolean; onChange: (on: boolean) => void }) {
  const copy = s.types[type]
  return (
    <li className="notifications__type">
      <div>
        <p className="notifications__muted">{copy.hint}</p>
      </div>
      <Switch label={copy.label} checked={on} onChange={onChange} />
    </li>
  )
}

/** One ListRow per other device, with its Remove button. */
export function DeviceRows({ devices, onRemove }: { devices: PushDevice[]; onRemove: (id: number) => void }): ReactElement {
  return (
    <ul className="notifications__devices">
      {devices.map((d) => (
        <ListRow
          key={d.id}
          title={d.label}
          trailing={
            <Button type="button" variant="secondary" onClick={() => onRemove(d.id)} aria-label={s.remove(d.label)}>
              {s.removeShort}
            </Button>
          }
        />
      ))}
    </ul>
  )
}
