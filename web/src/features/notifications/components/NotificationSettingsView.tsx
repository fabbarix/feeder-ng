import type { ReactElement } from 'react'
import { Button, ListRow, Switch, Tile } from '../../../ui'
import { notificationStrings as s } from '../strings'
import { NOTIFICATION_TYPES, type NotificationType, type PushDevice, type PushSupport } from '../types'
import '../notifications.css'

export interface NotificationSettingsViewProps {
  support: PushSupport
  quietHours: { start: string; end: string } | undefined
  thisDevice: PushDevice | undefined
  otherDevices: PushDevice[]
  busy: boolean
  onEnable: () => void
  onDisable: () => void
  onSetType: (deviceId: number, type: NotificationType, on: boolean) => void
  onRemove: (deviceId: number) => void
}

const SUPPORT_MESSAGE: Partial<Record<PushSupport, string>> = {
  unsupported: s.unsupported,
  'needs-install': s.needsInstall,
  denied: s.denied,
}

/**
 * Renders the notification settings Tile. By support: 'unsupported' / 'needs-install' /
 * 'denied' show their message and nothing else. 'supported' without a device shows the
 * button "Turn on notifications on this device" (disabled while busy). With this device:
 * a switch per type, checked from the device's flags, calling onSetType(id, type, !checked);
 * a "Turn off notifications on this device" button; the quiet-hours note; and "Your other
 * devices" with a "Remove <label>" button each.
 */
export function NotificationSettingsView(props: NotificationSettingsViewProps): ReactElement {
  const message = SUPPORT_MESSAGE[props.support]
  if (message) {
    return (
      <Tile as="section" span="full" aria-label={s.title}>
        <p className="notifications__muted">{message}</p>
      </Tile>
    )
  }
  const { thisDevice } = props
  return (
    <Tile as="section" span="full" aria-label={s.title}>
      {thisDevice ? (
        <ThisDevice device={thisDevice} busy={props.busy} onSetType={props.onSetType} onDisable={props.onDisable} />
      ) : (
        <Button type="button" onClick={props.onEnable} disabled={props.busy}>
          {props.busy ? s.enabling : s.enable}
        </Button>
      )}
      {props.quietHours ? (
        <p className="notifications__muted">{s.quietHours(props.quietHours.start, props.quietHours.end)}</p>
      ) : null}
      {props.otherDevices.length > 0 ? <OtherDevices devices={props.otherDevices} onRemove={props.onRemove} /> : null}
    </Tile>
  )
}

function ThisDevice({
  device,
  busy,
  onSetType,
  onDisable,
}: {
  device: PushDevice
  busy: boolean
  onSetType: NotificationSettingsViewProps['onSetType']
  onDisable: () => void
}) {
  return (
    <div className="notifications__this">
      <h2 className="notifications__heading">{s.thisDeviceHeading}</h2>
      <ul className="notifications__types">
        {NOTIFICATION_TYPES.map((type) => (
          <TypeSwitch key={type} type={type} on={device.types[type]} onChange={(on) => onSetType(device.id, type, on)} />
        ))}
      </ul>
      <Button type="button" variant="tertiary" onClick={onDisable} disabled={busy}>
        {s.disable}
      </Button>
    </div>
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

function OtherDevices({ devices, onRemove }: { devices: PushDevice[]; onRemove: (id: number) => void }) {
  return (
    <section>
      <h2 className="notifications__heading">{s.otherDevices}</h2>
      <ul className="notifications__devices">
        {devices.map((d) => (
          <ListRow
            key={d.id}
            title={d.label}
            trailing={
              <Button type="button" variant="tertiary" onClick={() => onRemove(d.id)} aria-label={s.remove(d.label)}>
                {s.removeShort}
              </Button>
            }
          />
        ))}
      </ul>
    </section>
  )
}
